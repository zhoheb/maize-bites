import { finishIngestionRun, startIngestionRun } from '@maize-bites/db';
import { apiErrorSchema, healthResponseSchema, livenessResponseSchema } from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDeps } from '../app.js';
import { NOW, at, createTestApi, type TestApi } from '../test/seed.js';
import { DEEP_HEALTH_TTL_MS } from './health.js';

let api: TestApi;
let spied: TestApi[] = [];
beforeEach(async () => {
  api = await createTestApi();
  spied = [];
});
afterEach(async () => {
  await api.handle.close().catch(() => undefined);
  await Promise.all(spied.map((other) => other.handle.close()));
});

/** An app whose database handle records every use: any query starts with one of those reads. */
async function appWithDbSpy(overrides: Partial<AppDeps> = {}) {
  const calls: string[] = [];
  const db = new Proxy(api.handle.db, {
    get(target, property, receiver) {
      calls.push(String(property));
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  const other = await createTestApi({ db, ...overrides });
  spied.push(other);
  calls.length = 0;
  return { app: other.app, calls };
}

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
  healthResponseSchema.parse((await request(api.app).get('/api/health/deep')).body);

describe('GET /api/health', () => {
  it('reports the process, with its version and uptime', async () => {
    const { app } = await appWithDbSpy({ version: 'abc1234' });
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(livenessResponseSchema.parse(res.body)).toEqual({
      status: 'ok',
      uptime: expect.any(Number) as number,
      version: 'abc1234',
    });
  });

  it('makes no database calls, even with a session cookie', async () => {
    const { app, calls } = await appWithDbSpy();

    const res = await request(app)
      .get('/api/health')
      .set('Cookie', `mb_session=${'a'.repeat(43)}`);

    expect(res.status).toBe(200);
    expect(calls).toEqual([]);
  });

  it('stays up when the database is down', async () => {
    await api.handle.close();
    expect((await request(api.app).get('/api/health')).status).toBe(200);
  });
});

describe('GET /api/health/deep caching', () => {
  it('answers from memory for 60 s, then checks again', async () => {
    const clock = vi.fn(() => NOW);
    const { app, calls } = await appWithDbSpy({ now: clock });
    const get = () => request(app).get('/api/health/deep');

    expect((await get()).status).toBe(200);
    const afterFirst = calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    clock.mockReturnValue(new Date(NOW.getTime() + DEEP_HEALTH_TTL_MS - 1));
    expect((await get()).status).toBe(200);
    expect(calls).toHaveLength(afterFirst);

    clock.mockReturnValue(new Date(NOW.getTime() + DEEP_HEALTH_TTL_MS));
    expect((await get()).status).toBe(200);
    expect(calls.length).toBeGreaterThan(afterFirst);
  });

  it('shares one check between concurrent requests', async () => {
    const one = await appWithDbSpy();
    await request(one.app).get('/api/health/deep');

    const many = await appWithDbSpy();
    await Promise.all(Array.from({ length: 5 }, () => request(many.app).get('/api/health/deep')));

    expect(many.calls).toHaveLength(one.calls.length);
  });

  it('keeps a failure for the same 60 s, so an outage is not retried per request', async () => {
    const { app, calls } = await appWithDbSpy();
    await api.handle.close();

    expect((await request(app).get('/api/health/deep')).status).toBe(503);
    const afterFirst = calls.length;
    expect((await request(app).get('/api/health/deep')).status).toBe(503);
    expect(calls).toHaveLength(afterFirst);
  });
});

describe('GET /api/health/deep', () => {
  it('is degraded before any ingestion has completed', async () => {
    const res = await request(api.app).get('/api/health/deep');

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
    expect(await health()).toEqual({
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
    const body = await health();
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
    const res = await request(api.app).get('/api/health/deep');

    expect(res.status).toBe(503);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'service_unavailable',
      message: 'Database unavailable',
    });
  });
});
