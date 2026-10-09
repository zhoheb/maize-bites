import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database, DbHandle } from '../client.js';
import { reviewFlags } from '../schema.js';
import { createTestDb, eventInput, insertClassification } from '../testing.js';
import {
  flagForReview,
  listEventsNeedingRules,
  listLlmCandidates,
  listReviewQueue,
  recordClassification,
} from './classification.js';
import { upsertEvent } from './events.js';

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
});

afterEach(async () => {
  await handle.close();
});

const NOW = new Date('2026-10-01T12:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

async function event(title: string, extra: Parameters<typeof eventInput>[0] = {}) {
  return (await upsertEvent(db, eventInput({ title, startsAt: hours(3), ...extra }), NOW)).event;
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('listEventsNeedingRules', () => {
  it('returns live events without a rules verdict for their current content', async () => {
    const fresh = await event('fresh');
    const done = await event('already ruled');
    await insertClassification(db, done, { method: 'rules', hasFreeFood: false });
    await event('ended', { startsAt: hours(-5), endsAt: hours(-4) });
    await event('removed', { status: 'removed' });

    expect(titles(await listEventsNeedingRules(db, NOW))).toEqual([fresh.title]);
  });

  it('asks again when the content changes', async () => {
    const input = eventInput({ title: 'v1', startsAt: hours(3) });
    const { event: v1 } = await upsertEvent(db, input, NOW);
    await insertClassification(db, v1, { method: 'rules', hasFreeFood: false });
    await upsertEvent(db, { ...input, title: 'v2' }, NOW);

    expect(titles(await listEventsNeedingRules(db, NOW))).toEqual(['v2']);
  });
});

describe('classifier modes', () => {
  const prefilter = { method: 'rules', hasFreeFood: true, confidence: 0.3 } as const;
  const rulesVerdict = { method: 'rules', rulesMode: true, confidence: 0.75 } as const;

  it('rules mode judges content that only has a prefilter row, and not content it has judged', async () => {
    const fresh = await event('fresh');
    const prefiltered = await event('prefiltered only');
    await insertClassification(db, prefiltered, { ...prefilter, createdAt: hours(-2) });
    const judged = await event('judged in rules mode');
    await insertClassification(db, judged, { ...rulesVerdict, createdAt: hours(-2) });

    expect(titles(await listEventsNeedingRules(db, NOW, 'rules')).sort()).toEqual(
      [fresh.title, prefiltered.title].sort(),
    );
  });

  it('rules mode leaves content the LLM has already judged alone', async () => {
    const byLlm = await event('judged by the llm');
    await insertClassification(db, byLlm, { ...prefilter, createdAt: hours(-2) });
    await insertClassification(db, byLlm, { method: 'llm', createdAt: hours(-1) });

    expect(await listEventsNeedingRules(db, NOW, 'rules')).toEqual([]);
  });

  it('llm mode prefilters again over a rules-mode verdict, so it never blocks the LLM', async () => {
    const e = await event('published by rules mode');
    await insertClassification(db, e, { ...rulesVerdict, createdAt: hours(-2) });

    // Not an LLM candidate yet: the rules-mode row is not a prefilter row.
    expect(await listLlmCandidates(db, NOW)).toEqual([]);
    expect(titles(await listEventsNeedingRules(db, NOW))).toEqual([e.title]);

    // The prefilter writes its row, and the event is on the LLM's path as usual.
    await insertClassification(db, e, { ...prefilter, createdAt: hours(-1) });
    expect(await listEventsNeedingRules(db, NOW)).toEqual([]);
    expect(titles(await listLlmCandidates(db, NOW))).toEqual([e.title]);
  });

  it('a rules-mode negative does not keep a prefilter candidate from the LLM', async () => {
    const e = await event('lone food word');
    await insertClassification(db, e, {
      ...rulesVerdict,
      hasFreeFood: false,
      confidence: 0.2,
      createdAt: hours(-2),
    });
    await insertClassification(db, e, { ...prefilter, createdAt: hours(-1) });

    expect(titles(await listLlmCandidates(db, NOW))).toEqual([e.title]);
  });

  it('each mode re-judges when the other wrote the newest rules row', async () => {
    const e = await event('flip flop');
    await insertClassification(db, e, { ...rulesVerdict, createdAt: hours(-3) });
    await insertClassification(db, e, { ...prefilter, createdAt: hours(-2) });

    expect(titles(await listEventsNeedingRules(db, NOW, 'rules'))).toEqual([e.title]);
    expect(await listEventsNeedingRules(db, NOW, 'llm')).toEqual([]);

    await insertClassification(db, e, { ...rulesVerdict, createdAt: hours(-1) });
    expect(await listEventsNeedingRules(db, NOW, 'rules')).toEqual([]);
    expect(titles(await listEventsNeedingRules(db, NOW, 'llm'))).toEqual([e.title]);
  });
});

describe('listLlmCandidates', () => {
  it('returns rules candidates without an llm verdict or flag, soonest first', async () => {
    const later = await event('later candidate', { startsAt: hours(6) });
    const sooner = await event('sooner candidate', { startsAt: hours(1) });
    const negative = await event('rules said no');
    const judged = await event('llm already ran');
    const flagged = await event('flagged');
    const manual = await event('manual verdict');
    for (const e of [later, sooner, judged, flagged, manual]) {
      await insertClassification(db, e, { method: 'rules', confidence: 0.3 });
    }
    await insertClassification(db, negative, { method: 'rules', hasFreeFood: false });
    await insertClassification(db, judged, { method: 'llm' });
    await insertClassification(db, manual, { method: 'manual' });
    await flagForReview(db, {
      eventId: flagged.id,
      contentHash: flagged.contentHash,
      reason: 'llm_invalid_output',
    });

    expect(titles(await listLlmCandidates(db, NOW))).toEqual([
      'sooner candidate',
      'later candidate',
    ]);
  });

  it('re-queues an event whose content changed after the llm ran', async () => {
    const input = eventInput({ title: 'Lunch talk', startsAt: hours(3) });
    const { event: v1 } = await upsertEvent(db, input, NOW);
    await insertClassification(db, v1, { method: 'rules', confidence: 0.3 });
    await insertClassification(db, v1, { method: 'llm' });
    const { event: v2 } = await upsertEvent(db, { ...input, description: 'Now with pizza' }, NOW);
    await insertClassification(db, v2, { method: 'rules', confidence: 0.3 });

    expect(titles(await listLlmCandidates(db, NOW))).toEqual(['Lunch talk']);
  });
});

describe('recordClassification', () => {
  it('stores a verdict and returns it', async () => {
    const e = await event('x');
    const row = await recordClassification(db, {
      eventId: e.id,
      contentHash: e.contentHash,
      method: 'llm',
      model: 'claude-haiku-4-5',
      hasFreeFood: true,
      confidence: 0.8,
      mealType: 'snacks',
    });
    expect(row).toMatchObject({ eventId: e.id, method: 'llm', mealType: 'snacks', dietary: [] });
  });
});

describe('flagForReview', () => {
  it('upserts per (event, content hash) and reopens resolved flags', async () => {
    const e = await event('x');
    const key = { eventId: e.id, contentHash: e.contentHash };
    await flagForReview(db, { ...key, reason: 'first' });
    await db.update(reviewFlags).set({ resolvedAt: NOW });
    await flagForReview(db, { ...key, reason: 'second', detail: 'why' });

    expect(await db.select().from(reviewFlags)).toEqual([
      expect.objectContaining({ reason: 'second', detail: 'why', resolvedAt: null }),
    ]);
  });
});

describe('listReviewQueue', () => {
  it('includes review-band verdicts and flagged events, not published or manual ones', async () => {
    const band = await event('review band', { startsAt: hours(1) });
    await insertClassification(db, band, { confidence: 0.55 });
    const flagged = await event('flagged', { startsAt: hours(2) });
    await insertClassification(db, flagged, { method: 'rules', confidence: 0.3 });
    await flagForReview(db, {
      eventId: flagged.id,
      contentHash: flagged.contentHash,
      reason: 'llm_invalid_output',
    });

    const published = await event('published');
    await insertClassification(db, published, { confidence: 0.9 });
    const lowNo = await event('confident no');
    await insertClassification(db, lowNo, { hasFreeFood: false, confidence: 0.5 });
    const tooLow = await event('below band');
    await insertClassification(db, tooLow, { confidence: 0.39 });
    const settled = await event('settled by admin');
    await insertClassification(db, settled, { confidence: 0.5 });
    await insertClassification(db, settled, { method: 'manual', hasFreeFood: false });

    const queue = await listReviewQueue(db, NOW);

    expect(queue.map((q) => q.event.title)).toEqual(['review band', 'flagged']);
    expect(queue[0]).toMatchObject({ classification: { confidence: 0.55 }, flag: null });
    expect(queue[1]?.flag).toMatchObject({ reason: 'llm_invalid_output' });
  });

  it('drops flags once the content changes (a new version gets a fresh attempt)', async () => {
    const input = eventInput({ title: 'x', startsAt: hours(3) });
    const { event: v1 } = await upsertEvent(db, input, NOW);
    await flagForReview(db, {
      eventId: v1.id,
      contentHash: v1.contentHash,
      reason: 'llm_invalid_output',
    });
    await upsertEvent(db, { ...input, title: 'x v2' }, NOW);

    expect(await listReviewQueue(db, NOW)).toEqual([]);
  });
});
