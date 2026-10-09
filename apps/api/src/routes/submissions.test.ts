import { buildings, events, sql, submissions, users } from '@maize-bites/db';
import {
  AUTO_PUBLISH_TRUST_LEVEL,
  apiErrorSchema,
  buildingsResponseSchema,
  listEventsResponseSchema,
  submissionResponseSchema,
} from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_RATE_LIMITS,
  at,
  createTestApi,
  signIn,
  signInAdmin,
  type TestApi,
} from '../test/seed.js';

let api: TestApi;
let cookie: string;
let unionId: string;

beforeEach(async () => {
  api = await createTestApi();
  cookie = await signIn(api, 'tipster@umich.edu');
  const [union] = await api.handle.db
    .select({ id: buildings.id })
    .from(buildings)
    .where(sql`${buildings.name} = 'Michigan Union'`);
  unionId = union?.id ?? '';
});
afterEach(async () => {
  await api.handle.close();
});

const tip = (overrides: Record<string, unknown> = {}) => ({
  title: 'Leftover bagels in the lobby',
  description: 'About two dozen, plus cream cheese.',
  buildingId: unionId,
  room: 'Lobby',
  startsAt: at(0.25).toISOString(),
  endsAt: at(1).toISOString(),
  ...overrides,
});

const submit = (body: unknown, as = cookie) =>
  request(api.app)
    .post('/api/submissions')
    .set('Cookie', as)
    .send(body as object);

const publishedTitles = async () => {
  const res = await request(api.app).get('/api/events').query({ limit: 100 });
  return listEventsResponseSchema.parse(res.body).events.map((e) => e.title);
};

describe('POST /api/submissions', () => {
  it('requires a signed-in user', async () => {
    const res = await request(api.app).post('/api/submissions').send(tip());
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('unauthorized');
  });

  it("queues a new user's tip for review without publishing it", async () => {
    const res = await submit(tip());

    expect(res.status).toBe(201);
    const body = submissionResponseSchema.parse(res.body);
    expect(body).toMatchObject({ status: 'pending', eventId: null });

    const [row] = await api.handle.db.select().from(submissions);
    expect(row).toMatchObject({
      id: body.id,
      status: 'pending',
      title: 'Leftover bagels in the lobby',
      locationName: 'Michigan Union',
      room: 'Lobby',
      eventId: null,
    });
    expect(await publishedTitles()).not.toContain('Leftover bagels in the lobby');
  });

  it('rejects bad input with the standard error body', async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ title: 'x' }, /Invalid request/],
      [{ buildingId: 'the union' }, /Invalid request/],
      [{ endsAt: at(0.1).toISOString() }, /Invalid request/], // before the start
      [{ startsAt: at(1).toISOString(), endsAt: at(20).toISOString() }, /Invalid request/],
      [{ buildingId: '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11' }, /Unknown building/],
      [{ startsAt: at(-5).toISOString(), endsAt: at(-4).toISOString() }, /already ended/],
      [{ startsAt: at(-2).toISOString(), endsAt: null }, /already ended/],
      [{ startsAt: at(24 * 15).toISOString(), endsAt: null }, /two weeks ahead/],
    ];
    for (const [overrides, message] of cases) {
      const res = await submit(tip(overrides));
      expect(res.status, JSON.stringify(overrides)).toBe(400);
      const { error } = apiErrorSchema.parse(res.body);
      expect(error.code).toBe('invalid_request');
      expect(error.message).toMatch(message);
    }
    expect(await api.handle.db.$count(submissions)).toBe(0);
  });

  it('accepts a tip that started a little while ago and is still going', async () => {
    const res = await submit(tip({ startsAt: at(-0.5).toISOString(), endsAt: null }));
    expect(res.status).toBe(201);
  });

  it('auto-publishes once the user has three approved tips', async () => {
    const admin = await signInAdmin(api);
    for (let n = 1; n <= AUTO_PUBLISH_TRUST_LEVEL; n++) {
      const pending = submissionResponseSchema.parse(
        (await submit(tip({ title: `Reviewed tip ${n}` }))).body,
      );
      expect(pending.status).toBe('pending');
      const review = await request(api.app)
        .post(`/api/admin/submissions/${pending.id}`)
        .set('Cookie', admin)
        .send({ action: 'approve' });
      expect(review.status).toBe(200);
    }

    const res = await submit(tip({ title: 'Trusted tip' }));

    const body = submissionResponseSchema.parse(res.body);
    expect(body.status).toBe('approved');
    expect(body.eventId).not.toBeNull();
    const [event] = await api.handle.db
      .select()
      .from(events)
      .where(sql`${events.id} = ${body.eventId}`);
    expect(event).toMatchObject({
      source: 'submission',
      sourceEventId: body.id,
      title: 'Trusted tip',
      locationName: 'Michigan Union',
      status: 'active',
    });
    expect(await publishedTitles()).toContain('Trusted tip');

    const [user] = await api.handle.db
      .select({ trustLevel: users.trustLevel })
      .from(users)
      .where(sql`${users.email} = 'tipster@umich.edu'`);
    expect(user?.trustLevel).toBe(AUTO_PUBLISH_TRUST_LEVEL + 1);
  });

  it('still reviews a tip at two approvals, and rejected tips earn no trust', async () => {
    const admin = await signInAdmin(api);
    const review = async (title: string, action: 'approve' | 'reject') => {
      const { id } = submissionResponseSchema.parse((await submit(tip({ title }))).body);
      await request(api.app)
        .post(`/api/admin/submissions/${id}`)
        .set('Cookie', admin)
        .send({ action });
    };
    await review('one', 'approve');
    await review('two', 'approve');
    await review('spam', 'reject');
    await review('more spam', 'reject');

    const res = await submit(tip({ title: 'Third real tip' }));
    expect(submissionResponseSchema.parse(res.body).status).toBe('pending');
  });

  it('rate limits tips per user, not per IP', async () => {
    const limited = await createTestApi({
      rateLimits: { ...TEST_RATE_LIMITS, submissionsPerUser: { windowMs: 60_000, limit: 2 } },
    });
    try {
      const [building] = await limited.handle.db.select({ id: buildings.id }).from(buildings);
      const body = tip({ buildingId: building?.id });
      const first = await signIn(limited, 'one@umich.edu');
      const post = (as: string) =>
        request(limited.app).post('/api/submissions').set('Cookie', as).send(body);

      expect((await post(first)).status).toBe(201);
      expect((await post(first)).status).toBe(201);
      const third = await post(first);
      expect(third.status).toBe(429);
      expect(apiErrorSchema.parse(third.body).error.code).toBe('rate_limited');

      const second = await signIn(limited, 'two@umich.edu');
      expect((await post(second)).status).toBe(201);
    } finally {
      await limited.handle.close();
    }
  });
});

describe('GET /api/buildings', () => {
  it('lists buildings for the tip form without signing in', async () => {
    const res = await request(api.app).get('/api/buildings');
    expect(res.status).toBe(200);
    const { buildings: list } = buildingsResponseSchema.parse(res.body);
    expect(list.length).toBeGreaterThan(40);
    expect(list.map((b) => b.name)).toEqual([...list.map((b) => b.name)].sort());
    expect(list.find((b) => b.name === 'Michigan Union')).toMatchObject({ campus: 'central' });
  });
});
