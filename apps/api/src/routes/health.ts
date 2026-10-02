import { getLastSuccessfulIngestion, sql, type Database } from '@maize-bites/db';
import { INGESTION_STALE_MS, type HealthResponse } from '@maize-bites/shared';
import { Router } from 'express';
import { HttpError } from '../errors.js';

/**
 * Liveness plus pipeline freshness. 200 whenever the database answers; `status` is
 * "degraded" when the last complete ingestion is missing or older than INGESTION_STALE_MS,
 * so an uptime monitor should alert on status != "ok", not only on the HTTP code.
 */
export function healthRouter(db: Database, now: () => Date): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
    } catch {
      throw new HttpError(503, 'service_unavailable', 'Database unavailable');
    }
    const last = await getLastSuccessfulIngestion(db);
    const stale = last === null || now().getTime() - last.getTime() > INGESTION_STALE_MS;
    const body: HealthResponse = {
      status: stale ? 'degraded' : 'ok',
      database: 'ok',
      lastSuccessfulIngestionAt: last?.toISOString() ?? null,
      ingestionStale: stale,
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
