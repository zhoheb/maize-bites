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

async function run(finishedHoursAgo: number, complete = true) {
  const id = await startIngestionRun(api.handle.db, 'happening', at(-finishedHoursAgo - 0.01));
  await finishIngestionRun(api.handle.db, id, at(-finishedHoursAgo), { ...stats, complete });
}

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
    });
  });

  it('is ok with a recent complete ingestion', async () => {
    await run(1);
    expect(healthResponseSchema.parse((await request(api.app).get('/api/health')).body)).toEqual({
      status: 'ok',
      database: 'ok',
      lastSuccessfulIngestionAt: at(-1).toISOString(),
      ingestionStale: false,
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
