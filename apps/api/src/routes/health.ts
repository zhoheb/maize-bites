import {
  getLastSuccessfulIngestion,
  listSourceFreshness,
  sql,
  type Database,
} from '@maize-bites/db';
import {
  INGESTION_STALE_MS,
  SOURCE_ACTIVE_MS,
  SOURCE_STALE_MS,
  type HealthResponse,
} from '@maize-bites/shared';
import { Router } from 'express';
import { HttpError } from '../errors.js';

/**
 * Liveness plus pipeline freshness, overall and per source. 200 whenever the database answers.
 * `status` is "degraded" when any active source has no complete ingestion within its limit, or
 * nothing has ingested lately, so an uptime monitor should alert on status != "ok", not only on
 * the HTTP code. A source that hasn't run at all for SOURCE_ACTIVE_MS is taken to be switched
 * off and isn't reported.
 */
export function healthRouter(db: Database, now: () => Date): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
    } catch {
      throw new HttpError(503, 'service_unavailable', 'Database unavailable');
    }
    const at = now().getTime();
    const sources: HealthResponse['sources'] = (await listSourceFreshness(db)).flatMap((s) => {
      if (s.source === 'submission' || at - s.lastRunAt.getTime() > SOURCE_ACTIVE_MS) return [];
      return [
        {
          source: s.source,
          lastRunAt: s.lastRunAt.toISOString(),
          lastSuccessfulIngestionAt: s.lastSuccessAt?.toISOString() ?? null,
          stale:
            s.lastSuccessAt === null || at - s.lastSuccessAt.getTime() > SOURCE_STALE_MS[s.source],
        },
      ];
    });

    const last = await getLastSuccessfulIngestion(db);
    // With no active source, fall back to the age of the last ingestion from anywhere.
    const stale =
      sources.length > 0
        ? sources.every((s) => s.stale)
        : last === null || at - last.getTime() > INGESTION_STALE_MS;
    const body: HealthResponse = {
      status: stale || sources.some((s) => s.stale) ? 'degraded' : 'ok',
      database: 'ok',
      lastSuccessfulIngestionAt: last?.toISOString() ?? null,
      ingestionStale: stale,
      sources,
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
