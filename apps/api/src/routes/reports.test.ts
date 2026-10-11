import { reports, users } from '@maize-bites/db';
import {
  apiErrorSchema,
  eventDetailSchema,
  listEventsResponseSchema,
  reportResponseSchema,
} from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOW, TEST_RATE_LIMITS, at, createTestApi, signIn, type TestApi } from '../test/seed.js';

let api: TestApi;
let cookie: string;

beforeEach(async () => {
  api = await createTestApi();
  cookie = await signIn(api, 'reporter@umich.edu');
});
afterEach(async () => {
  await api.handle.close();
});

const report = (eventId: string, kind: unknown, as = cookie) =>
  request(api.app).post(`/api/events/${eventId}/reports`).set('Cookie', as).send({ kind });

describe('POST /api/events/:id/reports', () => {
  it('requires a signed-in user', async () => {
    const res = await request(api.app)
      .post(`/api/events/${api.seeded.bagels.id}/reports`)
      .send({ kind: 'food_gone' });
    expect(res.status).toBe(401);
  });

  it('404s for an unknown or unpublished event', async () => {
    for (const id of [
      '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11',
      api.seeded.reviewBand.id,
      api.seeded.removed.id,
    ]) {
      const res = await report(id, 'food_gone');
      expect(res.status).toBe(404);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('not_found');
    }
    expect(await api.handle.db.$count(reports)).toBe(5); // the seeded ones only
  });

  it('rejects an unknown kind or a malformed id', async () => {
    expect((await report(api.seeded.bagels.id, 'yum')).status).toBe(400);
    expect((await report(api.seeded.bagels.id, undefined)).status).toBe(400);
    expect((await report('not-a-uuid', 'food_gone')).status).toBe(400);
  });

  it('records one report of each kind per user and returns fresh counts', async () => {
    const { id } = api.seeded.bagels;

    const first = await report(id, 'still_food');
    expect(first.status).toBe(201);
    expect(reportResponseSchema.parse(first.body)).toEqual({
      reportCounts: { food_gone: 0, still_food: 1, not_free: 0, wrong_info: 0 },
      lastReportAt: NOW.toISOString(),
      likelyGone: false,
    });

    // The same kind again changes nothing.
    const repeat = await report(id, 'still_food');
    expect(repeat.status).toBe(200);
    expect(reportResponseSchema.parse(repeat.body).reportCounts.still_food).toBe(1);

    // A different kind from the same user is a new report.
    const other = await report(id, 'wrong_info');
    expect(other.status).toBe(201);
    expect(reportResponseSchema.parse(other.body).reportCounts).toEqual({
      food_gone: 0,
      still_food: 1,
      not_free: 0,
      wrong_info: 1,
    });
  });

  it('marks an event likely gone at the third food_gone report from different people', async () => {
    const { id } = api.seeded.bagels;
    const second = await signIn(api, 'second@umich.edu');
    const third = await signIn(api, 'third@umich.edu');

    expect(reportResponseSchema.parse((await report(id, 'food_gone')).body).likelyGone).toBe(false);
    // One person reporting twice is still one report.
    expect(reportResponseSchema.parse((await report(id, 'food_gone')).body).likelyGone).toBe(false);
    expect(
      reportResponseSchema.parse((await report(id, 'food_gone', second)).body).likelyGone,
    ).toBe(false);

    const tipping = reportResponseSchema.parse((await report(id, 'food_gone', third)).body);
    expect(tipping).toMatchObject({ likelyGone: true, reportCounts: { food_gone: 3 } });

    const detail = eventDetailSchema.parse((await request(api.app).get(`/api/events/${id}`)).body);
    expect(detail).toMatchObject({ likelyGone: true, reportCounts: { food_gone: 3 } });
    const list = listEventsResponseSchema.parse((await request(api.app).get('/api/events')).body);
    expect(list.events.find((e) => e.id === id)?.likelyGone).toBe(true);
  });

  it('does not count food_gone reports older than an hour toward likely gone', async () => {
    const { id } = api.seeded.breakfast;
    const old = await api.handle.db
      .insert(users)
      .values(['x', 'y', 'z'].map((n) => ({ email: `${n}@umich.edu` })))
      .returning({ id: users.id });
    await api.handle.db.insert(reports).values(
      old.map((u) => ({
        eventId: id,
        userId: u.id,
        kind: 'food_gone' as const,
        createdAt: at(-2),
      })),
    );

    const res = reportResponseSchema.parse((await report(id, 'food_gone')).body);

    // Four reports in total, but only one in the last hour.
    expect(res).toMatchObject({ likelyGone: false, reportCounts: { food_gone: 4 } });
  });

  it('rate limits reports per user', async () => {
    const limited = await createTestApi({
      rateLimits: { ...TEST_RATE_LIMITS, reportsPerUser: { windowMs: 60_000, limit: 2 } },
    });
    try {
      const as = await signIn(limited, 'busy@umich.edu');
      const post = (kind: string) =>
        request(limited.app)
          .post(`/api/events/${limited.seeded.bagels.id}/reports`)
          .set('Cookie', as)
          .send({ kind });
      expect((await post('food_gone')).status).toBe(201);
      expect((await post('still_food')).status).toBe(201);
      const third = await post('not_free');
      expect(third.status).toBe(429);
      expect(apiErrorSchema.parse(third.body).error.code).toBe('rate_limited');
    } finally {
      await limited.handle.close();
    }
  });
});
