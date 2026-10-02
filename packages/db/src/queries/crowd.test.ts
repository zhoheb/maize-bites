import { AUTO_PUBLISH_TRUST_LEVEL, FOOD_GONE_THRESHOLD } from '@maize-bites/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database, DbHandle } from '../client.js';
import { buildings, submissions, users, type UserRow } from '../schema.js';
import { seedBuildings } from '../seed/seed-buildings.js';
import { toFoodEvent } from '../serializers.js';
import { createTestDb, insertClassification } from '../testing.js';
import { addBuildingAlias, classifyOutcome } from './admin.js';
import { upsertUserByEmail } from './auth.js';
import { listReviewQueue } from './classification.js';
import { getPublishedEvent, listPublishedEvents } from './events.js';
import { addReport, countReportsByKind } from './reports.js';
import {
  SubmissionStateError,
  approveSubmission,
  listPendingSubmissions,
  rejectSubmission,
  submitTip,
  type TipInput,
} from './submissions.js';

let handle: DbHandle;
let db: Database;
let union: string;

const NOW = new Date('2026-10-01T16:00:00Z');
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  await seedBuildings(db);
  const [row] = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(eq(buildings.name, 'Michigan Union'));
  union = row?.id ?? '';
});
afterEach(async () => {
  await handle.close();
});

const tip = (over: Partial<TipInput> = {}): TipInput => ({
  title: 'Leftover pizza in the Union',
  description: 'Two boxes by the front desk',
  buildingId: union,
  room: 'Pendleton Room',
  startsAt: minutes(0),
  endsAt: minutes(60),
  ...over,
});

async function user(email: string, trustLevel = 0): Promise<UserRow> {
  const u = await upsertUserByEmail(db, email);
  if (trustLevel === 0) return u;
  const [updated] = await db
    .update(users)
    .set({ trustLevel })
    .where(eq(users.id, u.id))
    .returning();
  return updated ?? u;
}

const trustOf = async (id: string) =>
  (await db.select().from(users).where(eq(users.id, id)))[0]?.trustLevel;

describe('trust logic', () => {
  it('new users’ tips wait for review and are not published', async () => {
    const u = await user('new@umich.edu');
    const { submission, event } = await submitTip(db, u, tip(), NOW);

    expect(submission.status).toBe('pending');
    expect(event).toBeNull();
    expect((await listPublishedEvents(db, { from: NOW })).items).toEqual([]);
    expect((await listPendingSubmissions(db)).map((p) => p.submitter.email)).toEqual([
      'new@umich.edu',
    ]);
  });

  it(`users with ${AUTO_PUBLISH_TRUST_LEVEL} approved tips publish immediately`, async () => {
    const trusted = await user('trusted@umich.edu', AUTO_PUBLISH_TRUST_LEVEL);
    const { submission, event } = await submitTip(db, trusted, tip(), NOW);

    expect(submission).toMatchObject({ status: 'approved', reviewedBy: null, eventId: event?.id });
    expect(event).toMatchObject({
      source: 'submission',
      sourceEventId: submission.id,
      locationName: 'Michigan Union',
    });
    const published = await listPublishedEvents(db, { from: NOW });
    expect(published.items.map((i) => i.event.id)).toEqual([event?.id]);
    expect(await trustOf(trusted.id)).toBe(AUTO_PUBLISH_TRUST_LEVEL + 1);
  });

  it('one below the threshold still goes to review', async () => {
    const almost = await user('almost@umich.edu', AUTO_PUBLISH_TRUST_LEVEL - 1);
    expect((await submitTip(db, almost, tip(), NOW)).event).toBeNull();
  });

  it('each approval raises trust; the third approval unlocks auto-publish', async () => {
    const u = await user('growing@umich.edu');
    const admin = await user('admin@umich.edu');
    for (let i = 0; i < AUTO_PUBLISH_TRUST_LEVEL; i++) {
      const { submission } = await submitTip(
        db,
        { ...u, trustLevel: (await trustOf(u.id)) ?? 0 },
        tip({ title: `Tip ${i}` }),
        NOW,
      );
      expect(submission.status).toBe('pending');
      await approveSubmission(db, submission.id, admin, NOW);
    }
    expect(await trustOf(u.id)).toBe(AUTO_PUBLISH_TRUST_LEVEL);

    const next = await submitTip(
      db,
      { ...u, trustLevel: AUTO_PUBLISH_TRUST_LEVEL },
      tip({ title: 'Tip 4' }),
      NOW,
    );
    expect(next.submission.status).toBe('approved');
  });

  it('rejection does not raise trust and cannot be approved later', async () => {
    const u = await user('u@umich.edu');
    const admin = await user('admin@umich.edu');
    const { submission } = await submitTip(db, u, tip(), NOW);

    await rejectSubmission(db, submission.id, admin, NOW);

    expect(await trustOf(u.id)).toBe(0);
    await expect(approveSubmission(db, submission.id, admin, NOW)).rejects.toThrow(
      SubmissionStateError,
    );
    const [row] = await db.select().from(submissions);
    expect(row).toMatchObject({ status: 'rejected', reviewedBy: admin.id, reviewedAt: NOW });
  });

  it('rejects unknown buildings', async () => {
    const u = await user('u@umich.edu');
    await expect(
      submitTip(db, u, tip({ buildingId: '00000000-0000-4000-8000-000000000000' }), NOW),
    ).rejects.toThrow(/Unknown building/);
  });
});

describe('approved tips and the classifier', () => {
  async function approvedTip() {
    const trusted = await user('trusted@umich.edu', AUTO_PUBLISH_TRUST_LEVEL);
    const { event } = await submitTip(db, trusted, tip(), NOW);
    if (!event) throw new Error('expected an event');
    return event;
  }

  it('publishes before extraction with empty food details, then shows the LLM extraction', async () => {
    const event = await approvedTip();
    const before = await getPublishedEvent(db, event.id);
    expect(before?.classification).toBeNull();
    expect(before && toFoodEvent(before)).toMatchObject({
      source: 'submission',
      foodItems: [],
      audience: null,
    });

    await insertClassification(db, event, {
      method: 'llm',
      foodItems: ['pizza'],
      confidence: 0.95,
    });
    const after = await getPublishedEvent(db, event.id);
    expect(after && toFoodEvent(after).foodItems).toEqual(['pizza']);
  });

  it('stays published when the LLM disagrees, but goes to the review queue', async () => {
    const event = await approvedTip();
    await insertClassification(db, event, { method: 'llm', hasFreeFood: false, confidence: 0.9 });

    expect(await getPublishedEvent(db, event.id)).not.toBeNull();
    expect((await listReviewQueue(db, NOW)).map((q) => q.event.id)).toEqual([event.id]);
  });

  it('an admin hide (manual verdict) removes it', async () => {
    const event = await approvedTip();
    await insertClassification(db, event, { method: 'manual', hasFreeFood: false });
    expect(await getPublishedEvent(db, event.id)).toBeNull();
  });
});

describe('report thresholds', () => {
  async function publishedEvent() {
    const trusted = await user('trusted@umich.edu', AUTO_PUBLISH_TRUST_LEVEL);
    const { event } = await submitTip(db, trusted, tip(), NOW);
    if (!event) throw new Error('expected an event');
    return event;
  }
  const reporters = (n: number) =>
    Promise.all(Array.from({ length: n }, (_, i) => user(`r${i}@umich.edu`)));
  const likelyGone = async (eventId: string, now = NOW) => {
    const p = await getPublishedEvent(db, eventId, {
      reportsSince: new Date(now.getTime() - 60 * 60_000),
    });
    return p ? toFoodEvent(p).likelyGone : null;
  };

  it(`${FOOD_GONE_THRESHOLD} "food's gone" reports within the hour mark it likely gone`, async () => {
    const e = await publishedEvent();
    const people = await reporters(FOOD_GONE_THRESHOLD);

    for (const [i, p] of people.entries()) {
      expect(await likelyGone(e.id)).toBe(false);
      await addReport(db, {
        eventId: e.id,
        userId: p.id,
        kind: 'food_gone',
        createdAt: minutes(-10 * i),
      });
    }
    expect(await likelyGone(e.id)).toBe(true);
  });

  it('reports older than an hour do not count', async () => {
    const e = await publishedEvent();
    const people = await reporters(3);
    await addReport(db, {
      eventId: e.id,
      userId: people[0]?.id ?? '',
      kind: 'food_gone',
      createdAt: minutes(-61),
    });
    await addReport(db, {
      eventId: e.id,
      userId: people[1]?.id ?? '',
      kind: 'food_gone',
      createdAt: minutes(-30),
    });
    await addReport(db, {
      eventId: e.id,
      userId: people[2]?.id ?? '',
      kind: 'food_gone',
      createdAt: minutes(-5),
    });

    expect(await likelyGone(e.id)).toBe(false);
    expect((await countReportsByKind(db, e.id)).food_gone).toBe(3); // all-time count still shown
  });

  it('one report of each kind per user: repeats are ignored', async () => {
    const e = await publishedEvent();
    const [p] = await reporters(1);
    const id = p?.id ?? '';
    expect(
      await addReport(db, { eventId: e.id, userId: id, kind: 'food_gone', createdAt: NOW }),
    ).toBe(true);
    expect(
      await addReport(db, { eventId: e.id, userId: id, kind: 'food_gone', createdAt: NOW }),
    ).toBe(false);
    expect(
      await addReport(db, { eventId: e.id, userId: id, kind: 'still_food', createdAt: NOW }),
    ).toBe(true);

    expect(await countReportsByKind(db, e.id)).toMatchObject({ food_gone: 1, still_food: 1 });
  });

  it('other kinds never mark it gone', async () => {
    const e = await publishedEvent();
    for (const p of await reporters(5)) {
      await addReport(db, { eventId: e.id, userId: p.id, kind: 'still_food', createdAt: NOW });
    }
    expect(await likelyGone(e.id)).toBe(false);
  });
});

describe('addBuildingAlias', () => {
  it('adds an alias once, case-insensitively', async () => {
    await addBuildingAlias(db, union, 'Pendleton Center');
    const row = await addBuildingAlias(db, union, 'pendleton center');
    expect(row?.aliases.filter((a) => a.toLowerCase() === 'pendleton center')).toEqual([
      'Pendleton Center',
    ]);
  });
});

describe('classifyOutcome', () => {
  const v = (method: 'rules' | 'llm' | 'manual', hasFreeFood: boolean, confidence: number) => ({
    method,
    hasFreeFood,
    confidence,
  });

  it.each([
    [{ source: 'happening', active: v('llm', true, 0.9), flagged: false }, 'published'],
    [{ source: 'happening', active: v('llm', true, 0.5), flagged: false }, 'review'],
    [{ source: 'happening', active: v('llm', false, 0.9), flagged: false }, 'rejected_llm'],
    [{ source: 'happening', active: v('rules', false, 0.9), flagged: false }, 'rejected_rules'],
    [{ source: 'happening', active: v('rules', true, 0.3), flagged: false }, 'pending_llm'],
    [{ source: 'happening', active: v('rules', true, 0.3), flagged: true }, 'review'],
    [{ source: 'happening', active: v('manual', false, 1), flagged: false }, 'hidden_by_admin'],
    [{ source: 'happening', active: v('manual', true, 1), flagged: false }, 'published'],
    [{ source: 'happening', active: null, flagged: false }, 'unclassified'],
    [{ source: 'submission', active: null, flagged: false }, 'published'],
    [{ source: 'submission', active: v('manual', false, 1), flagged: false }, 'hidden_by_admin'],
  ] as const)('%j → %s', (input, outcome) => {
    expect(classifyOutcome(input)).toBe(outcome);
  });
});
