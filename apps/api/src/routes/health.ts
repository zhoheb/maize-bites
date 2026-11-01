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
  type LivenessResponse,
} from '@maize-bites/shared';
import { Router } from 'express';
import { HttpError } from '../errors.js';

/** /api/health/deep answers from memory for this long, whoever asks and however often. */
export const DEEP_HEALTH_TTL_MS = 60_000;

async function checkPipeline(db: Database, at: number): Promise<HealthResponse> {
  try {
    await db.execute(sql`select 1`);
  } catch {
    throw new HttpError(503, 'service_unavailable', 'Database unavailable');
  }
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
  return {
    status: stale || sources.some((s) => s.stale) ? 'degraded' : 'ok',
    database: 'ok',
    lastSuccessfulIngestionAt: last?.toISOString() ?? null,
    ingestionStale: stale,
    sources,
  };
}

/**
 * Two checks, because the frequent one must let the database sleep.
 *
 * GET /: liveness for Render's health check (every few seconds) and the uptime monitor. It never
 * touches the database, and is mounted ahead of the session middleware so a cookie can't make
 * it. A monitor pointed here sees the process, not the pipeline.
 *
 * GET /deep: the database and pipeline freshness, overall and per source. 200 whenever the
 * database answers. `status` is "degraded" when any active source has no complete ingestion
 * within its limit, or nothing has ingested lately. A source that hasn't run at all for
 * SOURCE_ACTIVE_MS is taken to be switched off and isn't reported. The outcome, failure
 * included, is kept for DEEP_HEALTH_TTL_MS and concurrent requests share one check, so this
 * public route costs at most one round of queries a minute.
 */
export function healthRouter(db: Database, now: () => Date, version: string): Router {
  const router = Router();
  let cached: { at: number; result: Promise<HealthResponse> } | null = null;

  router.get('/', (_req, res) => {
    const body: LivenessResponse = { status: 'ok', uptime: process.uptime(), version };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/deep', async (_req, res) => {
    const at = now().getTime();
    if (cached === null || at - cached.at >= DEEP_HEALTH_TTL_MS)
      cached = { at, result: checkPipeline(db, at) };
    res.set('Cache-Control', 'no-store').json(await cached.result);
  });

  return router;
}
