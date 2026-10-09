import { finishIngestionRun, startIngestionRun } from '@maize-bites/db';
import { apiErrorSchema, healthResponseSchema } from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, createTestApi, type TestApi } from '../test/seed.js';

let api: TestApi;
beforeEach(async () => {
  api = await createTestApi();
});
afterEach(async () => {
  await api.handle.close().catch(() => undefined);
});

const stats = {
  fetched: 10,
  created: 10,
  updated: 0,
  classified: 0,
  removed: 0,
  errors: 0,
  errorMessages: [],
};

async function run(
  finishedHoursAgo: number,
  complete = true,
  source: 'happening' | 'maizepages' = 'happening',
) {
  const id = await startIngestionRun(api.handle.db, source, at(-finishedHoursAgo - 0.01));
  await finishIngestionRun(api.handle.db, id, at(-finishedHoursAgo), { ...stats, complete });
}

const health = async () =>
  healthResponseSchema.parse((await request(api.app).get('/api/health')).body);

describe('GET /api/health', () => {
  it('is degraded before any ingestion has completed', async () => {
    const res = await request(api.app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(healthResponseSchema.parse(res.body)).toEqual({
      status: 'degraded',
      database: 'ok',
      lastSuccessfulIngestionAt: null,
      ingestionStale: true,
      sources: [],
    });
  });

  it('is ok with a recent complete ingestion', async () => {
    await run(1);
    expect(healthResponseSchema.parse((await request(api.app).get('/api/health')).body)).toEqual({
      status: 'ok',
      database: 'ok',
      lastSuccessfulIngestionAt: at(-1).toISOString(),
      ingestionStale: false,
      sources: [
        {
          source: 'happening',
          lastRunAt: at(-1.01).toISOString(),
          lastSuccessfulIngestionAt: at(-1).toISOString(),
          stale: false,
        },
      ],
    });
  });

  it('is degraded when the last complete ingestion is over 3 hours old', async () => {
    await run(4);
    await run(0.5, false); // a recent but incomplete run doesn't count
    const body = healthResponseSchema.parse((await request(api.app).get('/api/health')).body);
    expect(body).toMatchObject({
      status: 'degraded',
      ingestionStale: true,
      lastSuccessfulIngestionAt: at(-4).toISOString(),
    });
  });

  it('reports each source, and is degraded when one is stale even if another is fresh', async () => {
    await run(30); // Happening last completed 30h ago...
    await run(0.5, false); // ...and is still trying and failing (a bot challenge, say)
    await run(2, true, 'maizepages');

    expect(await health()).toEqual({
      status: 'degraded',
      database: 'ok',
      // Something did update recently, so the site's data isn't flagged as out of date.
      lastSuccessfulIngestionAt: at(-2).toISOString(),
      ingestionStale: false,
      sources: [
        {
          source: 'happening',
          lastRunAt: at(-0.51).toISOString(),
          lastSuccessfulIngestionAt: at(-30).toISOString(),
          stale: true,
        },
        {
          source: 'maizepages',
          lastRunAt: at(-2.01).toISOString(),
          lastSuccessfulIngestionAt: at(-2).toISOString(),
          stale: false,
        },
      ],
    });
  });

  it('gives Maize Pages, read every five hours, eleven hours before it is stale', async () => {
    await run(10, true, 'maizepages');
    expect(await health()).toMatchObject({ status: 'ok', sources: [{ stale: false }] });

    await api.handle.close();
    api = await createTestApi();
    await run(12, true, 'maizepages');
    expect(await health()).toMatchObject({
      status: 'degraded',
      ingestionStale: true,
      sources: [{ source: 'maizepages', stale: true }],
    });
  });

  it('leaves out a source that has not run for two days (switched off)', async () => {
    await run(72); // Happening, disabled since
    await run(1, true, 'maizepages');

    const body = await health();
    expect(body.sources.map((s) => s.source)).toEqual(['maizepages']);
    expect(body).toMatchObject({ status: 'ok', ingestionStale: false });
  });

  it('returns 503 in the standard error format when the database is down', async () => {
    await api.handle.close();
    const res = await request(api.app).get('/api/health');

    expect(res.status).toBe(503);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'service_unavailable',
      message: 'Database unavailable',
    });
  });
});
