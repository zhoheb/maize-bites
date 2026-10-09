import {
  auditLog,
  buildings,
  classifications,
  events,
  finishIngestionRun,
  flagForReview,
  recordLocationMisses,
  reviewFlags,
  sql,
  startIngestionRun,
  submissions,
  users,
} from '@maize-bites/db';
import {
  adminMetricsResponseSchema,
  apiErrorSchema,
  auditLogResponseSchema,
  eventDetailSchema,
  listEventsResponseSchema,
  reviewQueueResponseSchema,
  submissionResponseSchema,
} from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOW, at, createTestApi, signIn, signInAdmin, type TestApi } from '../test/seed.js';

let api: TestApi;

beforeEach(async () => {
  api = await createTestApi();
});
afterEach(async () => {
  await api.handle.close();
});

const ID = '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11';
const ADMIN_ROUTES = [
  ['get', '/api/admin/review-queue'],
  ['post', `/api/admin/events/${ID}/override`],
  ['post', `/api/admin/submissions/${ID}`],
  ['get', '/api/admin/metrics'],
  ['post', `/api/admin/buildings/${ID}/aliases`],
  ['get', '/api/admin/audit-log'],
] as const;

describe('admin routes require an admin', () => {
  it.each(ADMIN_ROUTES)('401 when signed out: %s %s', async (method, path) => {
    const res = await request(api.app)[method](path);
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('unauthorized');
  });

  it.each(ADMIN_ROUTES)('403 for a non-admin: %s %s', async (method, path) => {
    const cookie = await signIn(api, 'wolverine@umich.edu');
    const res = await request(api.app)[method](path).set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'forbidden',
      message: 'Admins only',
    });
  });

  it('a refused request changes nothing and writes no audit entry', async () => {
    const cookie = await signIn(api, 'wolverine@umich.edu');
    await request(api.app)
      .post(`/api/admin/events/${api.seeded.pizza.id}/override`)
      .set('Cookie', cookie)
      .send({ action: 'hide' });
    expect(await api.handle.db.$count(auditLog)).toBe(0);
    expect(await api.handle.db.$count(classifications, sql`method = 'manual'`)).toBe(1); // seeded
  });
});

describe('as an admin', () => {
  let admin: string;
  let adminId: string;

  beforeEach(async () => {
    admin = await signInAdmin(api);
    const [row] = await api.handle.db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.email} = 'admin@umich.edu'`);
    adminId = row?.id ?? '';
  });

  const get = (path: string) => request(api.app).get(path).set('Cookie', admin);
  const post = (path: string, body: object) =>
    request(api.app).post(path).set('Cookie', admin).send(body);
  const audit = () => api.handle.db.select().from(auditLog).orderBy(auditLog.createdAt);
  const published = async () =>
    listEventsResponseSchema
      .parse((await request(api.app).get('/api/events').query({ limit: 100 })).body)
      .events.map((e) => e.title);

  async function pendingTip(title = 'Donuts in the atrium'): Promise<string> {
    const cookie = await signIn(api, 'tipster@umich.edu');
    const [building] = await api.handle.db
      .select({ id: buildings.id })
      .from(buildings)
      .where(sql`${buildings.name} = 'Michigan Union'`);
    const res = await request(api.app)
      .post('/api/submissions')
      .set('Cookie', cookie)
      .send({ title, buildingId: building?.id, startsAt: at(1).toISOString() });
    return submissionResponseSchema.parse(res.body).id;
  }

  describe('GET /review-queue', () => {
    it('lists review-band events, flagged events, and pending tips', async () => {
      await flagForReview(api.handle.db, {
        eventId: api.seeded.rulesOnly.id,
        contentHash: api.seeded.rulesOnly.contentHash,
        reason: 'llm_invalid_output',
        detail: 'evidence was not in the listing',
      });
      const tipId = await pendingTip();

      const res = await get('/api/admin/review-queue');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = reviewQueueResponseSchema.parse(res.body);
      expect(body.events.map((e) => e.event.title).sort()).toEqual([
        'Maybe snacks',
        'Unverified candidate',
      ]);
      const maybe = body.events.find((e) => e.event.title === 'Maybe snacks');
      expect(maybe).toMatchObject({
        classification: { method: 'llm', hasFreeFood: true },
        flag: null,
      });
      expect(maybe?.classification?.confidence).toBeCloseTo(0.55);
      expect(body.events.find((e) => e.event.title === 'Unverified candidate')?.flag).toEqual({
        reason: 'llm_invalid_output',
        detail: 'evidence was not in the listing',
      });
      expect(body.submissions).toEqual([
        expect.objectContaining({
          id: tipId,
          title: 'Donuts in the atrium',
          locationName: 'Michigan Union',
          submitter: { email: 'tipster@umich.edu', trustLevel: 0 },
        }),
      ]);
    });
  });

  describe('POST /events/:id/override', () => {
    it('shows a hidden event with a manual verdict, and records who did it', async () => {
      const { id } = api.seeded.reviewBand;
      expect(await published()).not.toContain('Maybe snacks');

      const res = await post(`/api/admin/events/${id}/override`, {
        action: 'show',
        foodItems: ['granola bars'],
        mealType: 'snacks',
        dietary: ['vegan'],
        audience: 'open',
        note: 'Confirmed with the organizer',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ eventId: id, action: 'show' });
      expect(await published()).toContain('Maybe snacks');
      const detail = eventDetailSchema.parse(
        (await request(api.app).get(`/api/events/${id}`)).body,
      );
      expect(detail).toMatchObject({
        foodItems: ['granola bars'],
        mealType: 'snacks',
        dietary: ['vegan'],
        audience: 'open',
        classification: {
          method: 'manual',
          confidence: 1,
          evidence: 'Confirmed with the organizer',
        },
      });

      expect(await audit()).toEqual([
        expect.objectContaining({
          actorId: adminId,
          action: 'event.override',
          targetType: 'event',
          targetId: id,
          createdAt: NOW,
          details: expect.objectContaining({ action: 'show', title: 'Maybe snacks' }) as unknown,
        }),
      ]);
    });

    it('hides a published event, whatever the classifier said', async () => {
      const { id } = api.seeded.pizza;
      const res = await post(`/api/admin/events/${id}/override`, { action: 'hide' });

      expect(res.status).toBe(201);
      expect(await published()).not.toContain('Pizza at the Union');
      expect((await request(api.app).get(`/api/events/${id}`)).status).toBe(404);
      expect((await audit()).map((a) => a.action)).toEqual(['event.override']);
    });

    it('keeps the extracted details when the override leaves them out', async () => {
      const { id } = api.seeded.pizza;
      await post(`/api/admin/events/${id}/override`, { action: 'show', audience: null });

      const detail = eventDetailSchema.parse(
        (await request(api.app).get(`/api/events/${id}`)).body,
      );
      expect(detail).toMatchObject({
        foodItems: ['pizza'],
        mealType: 'lunch',
        dietary: ['vegetarian'],
        audience: null, // explicitly cleared
        classification: { method: 'manual' },
      });
    });

    it('resolves the review flag and takes the event out of the queue', async () => {
      const { id, contentHash } = api.seeded.rulesOnly;
      await flagForReview(api.handle.db, {
        eventId: id,
        contentHash,
        reason: 'llm_invalid_output',
      });

      await post(`/api/admin/events/${id}/override`, { action: 'hide' });

      const [flag] = await api.handle.db.select().from(reviewFlags);
      expect(flag?.resolvedAt).toEqual(NOW);
      const queue = reviewQueueResponseSchema.parse((await get('/api/admin/review-queue')).body);
      expect(queue.events.map((e) => e.event.id)).not.toContain(id);
      expect((await audit())[0]?.details).toMatchObject({ flagsResolved: 1 });
    });

    it('404s for an unknown event and 400s for a bad body, with no audit entry', async () => {
      expect((await post(`/api/admin/events/${ID}/override`, { action: 'show' })).status).toBe(404);
      const bad = await post(`/api/admin/events/${api.seeded.pizza.id}/override`, {
        action: 'maybe',
      });
      expect(bad.status).toBe(400);
      expect(await audit()).toEqual([]);
    });
  });

  describe('POST /submissions/:id', () => {
    it('approves a tip: it becomes a published event and the submitter gains trust', async () => {
      const tipId = await pendingTip();

      const res = await post(`/api/admin/submissions/${tipId}`, { action: 'approve', note: 'ok' });

      expect(res.status).toBe(200);
      const eventId = (res.body as { eventId: string }).eventId;
      expect(res.body).toEqual({ status: 'approved', eventId });
      const [event] = await api.handle.db
        .select()
        .from(events)
        .where(sql`${events.id} = ${eventId}`);
      expect(event).toMatchObject({ source: 'submission', title: 'Donuts in the atrium' });
      expect(await published()).toContain('Donuts in the atrium');

      const [tip] = await api.handle.db.select().from(submissions);
      expect(tip).toMatchObject({
        status: 'approved',
        reviewedBy: adminId,
        reviewedAt: NOW,
        eventId,
      });
      const [submitter] = await api.handle.db
        .select({ trustLevel: users.trustLevel })
        .from(users)
        .where(sql`${users.email} = 'tipster@umich.edu'`);
      expect(submitter?.trustLevel).toBe(1);

      expect(await audit()).toEqual([
        expect.objectContaining({
          actorId: adminId,
          action: 'submission.approve',
          targetType: 'submission',
          targetId: tipId,
          details: { note: 'ok', eventId },
        }),
      ]);
    });

    it('rejects a tip: no event, no trust, and an audit entry', async () => {
      const tipId = await pendingTip();
      const before = await api.handle.db.$count(events);

      const res = await post(`/api/admin/submissions/${tipId}`, { action: 'reject' });

      expect(res.body).toEqual({ status: 'rejected', eventId: null });
      expect(await api.handle.db.$count(events)).toBe(before);
      const [tip] = await api.handle.db.select().from(submissions);
      expect(tip).toMatchObject({ status: 'rejected', reviewedBy: adminId, eventId: null });
      expect((await audit()).map((a) => [a.action, a.targetId])).toEqual([
        ['submission.reject', tipId],
      ]);
    });

    it('refuses to review a tip twice, and 404s for an unknown one', async () => {
      const tipId = await pendingTip();
      await post(`/api/admin/submissions/${tipId}`, { action: 'approve' });

      const again = await post(`/api/admin/submissions/${tipId}`, { action: 'reject' });
      expect(again.status).toBe(400);
      expect(apiErrorSchema.parse(again.body).error.message).toBe('Submission is already approved');
      expect((await post(`/api/admin/submissions/${ID}`, { action: 'approve' })).status).toBe(404);
      // Only the first review was recorded.
      expect((await audit()).map((a) => a.action)).toEqual(['submission.approve']);
    });
  });

  describe('GET /metrics', () => {
    const stats = { fetched: 0, created: 0, updated: 0, classified: 0, removed: 0 };

    it('reports ingestion per source, classifier outcomes, alerts, and location misses', async () => {
      const { db } = api.handle;
      const run = async (
        source: 'happening' | 'maizepages',
        startedHoursAgo: number,
        result: Parameters<typeof finishIngestionRun>[3],
      ) => {
        const id = await startIngestionRun(db, source, at(-startedHoursAgo));
        await finishIngestionRun(db, id, at(-startedHoursAgo + 0.01), result);
      };
      await run('happening', 26, {
        ...stats,
        fetched: 1196,
        complete: true,
        errors: 0,
        errorMessages: [],
      });
      await run('happening', 1, {
        ...stats,
        complete: false,
        errors: 1,
        errorMessages: ['fetch failed: HTTP 403 (blocked by a Cloudflare challenge)'],
      });
      await run('maizepages', 2, {
        ...stats,
        fetched: 27,
        created: 9,
        skippedDuplicates: 18,
        complete: true,
        errors: 0,
        errorMessages: [],
      });
      await recordLocationMisses(
        db,
        [{ normalizedName: 'east hall', locationName: 'East Hall', count: 7 }],
        NOW,
      );

      const res = await get('/api/admin/metrics');

      expect(res.status).toBe(200);
      const body = adminMetricsResponseSchema.parse(res.body);
      expect(body.sources).toEqual([
        {
          source: 'happening',
          lastRunAt: at(-1).toISOString(),
          lastSuccessAt: at(-25.99).toISOString(),
          lastError: 'fetch failed: HTTP 403 (blocked by a Cloudflare challenge)',
          recentRuns: 2,
          recentComplete: 1,
        },
        {
          source: 'maizepages',
          lastRunAt: at(-2).toISOString(),
          lastSuccessAt: at(-1.99).toISOString(),
          lastError: null,
          recentRuns: 1,
          recentComplete: 1,
        },
      ]);
      expect(body.runs.map((r) => r.source)).toEqual(['happening', 'maizepages', 'happening']);
      expect(body.runs[1]).toMatchObject({ fetched: 27, created: 9, skippedDuplicates: 18 });
      // Seeded: 6 published events in the window, one in the review band, one hidden by hand.
      expect(body.classifier.outcomes).toMatchObject({
        published: 6,
        review: 1,
        hidden_by_admin: 1,
        pending_llm: 1,
      });
      expect(body.classifier.alerts).toEqual({ sent: 0, failed: 0 });
      expect(body.locationMisses).toEqual([
        expect.objectContaining({ locationName: 'East Hall', seenCount: 7 }),
      ]);
    });

    it('answers with empty lists on a fresh database', async () => {
      const body = adminMetricsResponseSchema.parse((await get('/api/admin/metrics')).body);
      expect(body).toMatchObject({ sources: [], runs: [], locationMisses: [] });
    });
  });

  describe('POST /buildings/:id/aliases', () => {
    it('adds an alias for the location matcher and records it', async () => {
      const [union] = await api.handle.db
        .select()
        .from(buildings)
        .where(sql`${buildings.name} = 'Michigan Union'`);

      const res = await post(`/api/admin/buildings/${union?.id ?? ''}/aliases`, {
        alias: 'The Union Courtyard',
      });

      expect(res.status).toBe(201);
      expect((res.body as { aliases: string[] }).aliases).toContain('The Union Courtyard');
      expect(await audit()).toEqual([
        expect.objectContaining({
          actorId: adminId,
          action: 'building.add_alias',
          targetType: 'building',
          targetId: union?.id,
          details: { alias: 'The Union Courtyard', building: 'Michigan Union' },
        }),
      ]);
    });

    it('404s for an unknown building', async () => {
      const res = await post(`/api/admin/buildings/${ID}/aliases`, { alias: 'Nowhere Hall' });
      expect(res.status).toBe(404);
      expect(await audit()).toEqual([]);
    });
  });

  describe('GET /audit-log', () => {
    it('lists admin actions newest first with the actor email', async () => {
      const tipId = await pendingTip();
      await post(`/api/admin/submissions/${tipId}`, { action: 'reject' });
      await post(`/api/admin/events/${api.seeded.pizza.id}/override`, { action: 'hide' });

      const body = auditLogResponseSchema.parse((await get('/api/admin/audit-log')).body);

      expect(body.entries.map((e) => e.action).sort()).toEqual([
        'event.override',
        'submission.reject',
      ]);
      expect(body.entries.every((e) => e.actorEmail === 'admin@umich.edu')).toBe(true);
    });
  });
});
