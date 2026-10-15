import {
  classifications,
  getActiveClassification,
  listPublishedEvents,
  listReviewQueue,
  recordClassification,
  sql,
  upsertEvent,
  type Database,
  type DbHandle,
} from '@maize-bites/db';
import { createTestDb, eventInput } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMessage, mockAnthropic, verdictJson } from '../test/anthropic-mock.js';
import { classifyPendingEvents } from './classify-events.js';
import type { CreateMessage } from './llm.js';

// 8:00 AM in Ann Arbor; events start two hours later unless stated.
const NOW = new Date('2026-10-01T12:00:00Z');
const soon = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  for (const fn of Object.values(logger)) fn.mockReset();
});
afterEach(async () => {
  await handle.close();
});

async function event(
  title: string,
  description: string | null = null,
  extra: Parameters<typeof eventInput>[0] = {},
) {
  return (
    await upsertEvent(db, eventInput({ title, description, startsAt: soon(2), ...extra }), NOW)
  ).event;
}

/** `at` moves the clock for runs that must come after something else. */
const rulesMode = (createMessage: CreateMessage | null = null) =>
  classifyPendingEvents({
    db,
    logger,
    now: NOW,
    mode: 'rules',
    llm: createMessage ? { createMessage, maxCalls: 100 } : null,
  });
const llmMode = (createMessage: CreateMessage | null) =>
  classifyPendingEvents({
    db,
    logger,
    now: NOW,
    llm: createMessage ? { createMessage, maxCalls: 100 } : null,
  });

/** What GET /api/events serves: the published events, by title. */
const published = async () =>
  (await listPublishedEvents(db, { from: NOW, limit: 100 })).items.map((i) => i.event.title);
const rows = (eventId: string) =>
  db
    .select()
    .from(classifications)
    .where(sql`${classifications.eventId} = ${eventId}`)
    .orderBy(classifications.createdAt);

describe('classifyPendingEvents in rules mode', () => {
  it('publishes strong positives and nothing else, with no LLM call', async () => {
    const pizza = await event('Robotics build night', 'Free pizza and pop while we sort parts.');
    await event('Pizza and politics', 'Talk about the midterms.');
    await event('Fall banquet', 'Dinner will be served. $15 per person.');
    await event('Algebra seminar', 'Stacks and sheaves');
    const create = mockAnthropic(fakeMessage(verdictJson()));

    const stats = await rulesMode(create);

    expect(await published()).toEqual(['Robotics build night']);
    expect(stats).toMatchObject({
      rulesClassified: 4,
      rulesPublished: 1,
      llmPending: 0,
      llmCalls: 0,
      llmClassified: 0,
    });
    expect(create).not.toHaveBeenCalled();

    expect(await rows(pizza.id)).toEqual([
      expect.objectContaining({
        method: 'rules',
        rulesMode: true,
        model: null,
        hasFreeFood: true,
        contentHash: pizza.contentHash,
        foodItems: ['pizza'],
        mealType: null, // no meal named, and the 10 AM start is not used to guess one
        dietary: [],
        audience: 'unknown', // the listing doesn't say who can come
        audienceEvidence: null,
        evidence: 'Robotics build night Free pizza and pop while we sort parts.',
      }),
    ]);
    expect((await rows(pizza.id))[0]?.confidence).toBeCloseTo(0.75);
  });

  it('stores negatives at 0.2, out of the publish list and the review queue', async () => {
    const lone = await event('Pizza and politics', 'Talk about the midterms.');

    await rulesMode();

    const [row] = await rows(lone.id);
    expect(row).toMatchObject({ method: 'rules', rulesMode: true, hasFreeFood: false });
    expect(row?.confidence).toBeCloseTo(0.2);
    expect(await published()).toEqual([]);
    expect(await listReviewQueue(db, NOW)).toEqual([]);
  });

  it('publishes the Free Food perk at 0.85 and extracts the details', async () => {
    const perk = await event(
      'Chapter meeting',
      'Members only. Vegan and halal options. RSVP on Maize Pages.',
      { tags: ['Social', 'Free Food'], startsAt: soon(4.5) }, // 12:30 PM
    );

    await rulesMode();

    const active = await getActiveClassification(db, perk.id);
    expect(active).toMatchObject({
      hasFreeFood: true,
      evidence: 'tag: Free Food',
      mealType: null,
      dietary: ['vegan', 'halal'],
      audience: 'members',
      audienceEvidence: 'Members only',
    });
    expect(active?.confidence).toBeCloseTo(0.85);
    expect(await published()).toEqual(['Chapter meeting']);
  });

  it('judges each content version once, and again when the listing changes', async () => {
    const input = eventInput({
      title: 'Info session',
      description: 'Slides only.',
      startsAt: soon(2),
    });
    const { event: v1 } = await upsertEvent(db, input, NOW);
    await rulesMode();
    expect((await rulesMode()).rulesClassified).toBe(0);
    expect(await rows(v1.id)).toHaveLength(1);
    expect(await published()).toEqual([]);

    const { event: v2 } = await upsertEvent(db, { ...input, description: 'Lunch provided.' }, NOW);
    expect((await rulesMode()).rulesClassified).toBe(1);

    expect(v2.contentHash).not.toBe(v1.contentHash);
    expect(await rows(v1.id)).toHaveLength(2);
    expect(await published()).toEqual(['Info session']);
  });

  it('skips ended and removed events', async () => {
    await event('Old free pizza', 'Free pizza', { startsAt: soon(-5), endsAt: soon(-4) });
    await event('Removed free pizza', 'Free pizza', { status: 'removed' });
    expect((await rulesMode()).rulesClassified).toBe(0);
  });

  it('keeps a community tip published and adds details from the rules', async () => {
    const tip = await event('Leftover bagels in the lobby', 'Help yourself, some vegan.', {
      source: 'submission',
    });

    await rulesMode();

    expect(await published()).toEqual(['Leftover bagels in the lobby']);
    expect(await getActiveClassification(db, tip.id)).toMatchObject({
      hasFreeFood: true,
      foodItems: ['bagels'],
      dietary: ['vegan'],
    });
  });
});

describe('manual overrides in rules mode', () => {
  const manual = (hasFreeFood: boolean, createdAt: Date) => ({
    method: 'manual' as const,
    model: null,
    hasFreeFood,
    confidence: 1,
    createdAt,
  });

  it('a manual "hide" beats a rules positive, before or after it', async () => {
    const pizza = await event('Free pizza night');
    await rulesMode();
    expect(await published()).toEqual(['Free pizza night']);

    await recordClassification(db, {
      ...manual(false, soon(1)),
      eventId: pizza.id,
      contentHash: pizza.contentHash,
    });
    expect(await published()).toEqual([]);

    // A later rules run (the listing changed) still doesn't bring it back.
    await upsertEvent(
      db,
      eventInput({
        source: pizza.source,
        sourceEventId: pizza.sourceEventId,
        occurrenceId: pizza.occurrenceId,
        title: 'Free pizza night',
        description: 'Now with free boba too',
        startsAt: pizza.startsAt,
      }),
      NOW,
    );
    await rulesMode();
    expect(await published()).toEqual([]);
    expect((await getActiveClassification(db, pizza.id))?.method).toBe('manual');
  });

  it('a manual "show" beats a rules negative', async () => {
    const lone = await event('Pizza and politics');
    await rulesMode();
    expect(await published()).toEqual([]);

    await recordClassification(db, {
      ...manual(true, soon(1)),
      eventId: lone.id,
      contentHash: lone.contentHash,
    });
    expect(await published()).toEqual(['Pizza and politics']);
  });
});

describe('switching between modes', () => {
  it('llm mode reclassifies events that rules mode judged, positives and negatives alike', async () => {
    const pizza = await event('Robotics build night', 'Free pizza while we sort parts.');
    const lone = await event('Pizza and politics', 'Talk about the midterms.');
    const seminar = await event('Algebra seminar', 'Stacks and sheaves');
    await rulesMode();
    expect(await published()).toEqual(['Robotics build night']);

    // The model disagrees with the rules on both food events.
    const create = vi.fn<CreateMessage>((params) => {
      const text = JSON.stringify(params.messages);
      return Promise.resolve(
        text.includes('Pizza and politics')
          ? fakeMessage(verdictJson({ evidence: 'Pizza and politics', confidence: 0.9 }))
          : fakeMessage(verdictJson({ has_free_food: false, confidence: 0.9, evidence: '' })),
      );
    });

    const stats = await llmMode(create);

    // Both prefilter candidates went to the LLM; the seminar never does.
    expect(create).toHaveBeenCalledTimes(2);
    expect(stats).toMatchObject({ rulesClassified: 3, rulesCandidates: 2, llmClassified: 2 });
    expect(await published()).toEqual(['Pizza and politics']);
    expect((await getActiveClassification(db, pizza.id))?.method).toBe('llm');
    expect((await getActiveClassification(db, lone.id))?.method).toBe('llm');

    // Each event has its rules-mode row, the prefilter row written over it, and for
    // candidates the LLM's verdict.
    const kinds = async (id: string) =>
      (await rows(id)).map((r) => (r.method === 'rules' ? `rules:${r.rulesMode}` : r.method));
    expect(await kinds(pizza.id)).toEqual(['rules:true', 'rules:false', 'llm']);
    expect(await kinds(seminar.id)).toEqual(['rules:true', 'rules:false']);
  });

  it('llm mode with no key hides rules-mode positives again, as llm mode always has', async () => {
    await event('Robotics build night', 'Free pizza while we sort parts.');
    await rulesMode();
    expect(await published()).toEqual(['Robotics build night']);

    const stats = await llmMode(null);

    expect(stats).toMatchObject({ rulesClassified: 1, llmPending: 1, llmCalls: 0 });
    expect(await published()).toEqual([]);
  });

  it('rules mode keeps a verdict the LLM already gave, and judges only what it has not', async () => {
    const byLlm = await event('Mixer', 'Light refreshments');
    await llmMode(mockAnthropic(fakeMessage(verdictJson({ evidence: 'Light refreshments' }))));
    const fresh = await event('Open house', 'Free donuts');

    const stats = await rulesMode();

    expect(stats.rulesClassified).toBe(1);
    expect((await getActiveClassification(db, byLlm.id))?.method).toBe('llm');
    expect((await getActiveClassification(db, fresh.id))?.rulesMode).toBe(true);
    expect((await published()).sort()).toEqual(['Mixer', 'Open house']);
  });

  it('rules mode takes over again from a prefilter row that never reached the LLM', async () => {
    const pizza = await event('Robotics build night', 'Free pizza while we sort parts.');
    await rulesMode();
    await llmMode(null); // prefilter row written; hidden
    expect(await published()).toEqual([]);

    await rulesMode();

    expect(await published()).toEqual(['Robotics build night']);
    expect((await getActiveClassification(db, pizza.id))?.rulesMode).toBe(true);
  });
});
