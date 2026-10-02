import Anthropic from '@anthropic-ai/sdk';
import {
  classifications,
  getActiveClassification,
  listPublishedEvents,
  listReviewQueue,
  reviewFlags,
  sql,
  upsertEvent,
  type Database,
  type DbHandle,
} from '@maize-bites/db';
import { createTestDb, eventInput } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMessage, mockAnthropic, verdictJson } from '../test/anthropic-mock.js';
import {
  RULES_CANDIDATE_CONFIDENCE,
  RULES_NEGATIVE_CONFIDENCE,
  classifyPendingEvents,
} from './classify-events.js';
import type { CreateMessage } from './llm.js';

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

async function event(title: string, description: string | null = null, startsInHours = 2) {
  return (
    await upsertEvent(db, eventInput({ title, description, startsAt: soon(startsInHours) }), NOW)
  ).event;
}

const run = (createMessage: CreateMessage | null, maxCalls = 100) =>
  classifyPendingEvents({
    db,
    logger,
    now: NOW,
    llm: createMessage ? { createMessage, maxCalls } : null,
  });

describe('classifyPendingEvents', () => {
  it('runs rules on everything and the LLM only on candidates, then publishes confident verdicts', async () => {
    const pizza = await event('Pizza social', 'Free pizza for everyone');
    const seminar = await event('Algebra seminar', 'Stacks and sheaves');
    const create = mockAnthropic(fakeMessage(verdictJson({ evidence: 'Free pizza' })));

    const stats = await run(create);

    expect(stats).toMatchObject({
      rulesClassified: 2,
      rulesCandidates: 1,
      llmCalls: 1,
      llmClassified: 1,
      flagged: 0,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(await getActiveClassification(db, seminar.id)).toMatchObject({
      method: 'rules',
      hasFreeFood: false,
      confidence: RULES_NEGATIVE_CONFIDENCE,
    });
    expect(await getActiveClassification(db, pizza.id)).toMatchObject({
      method: 'llm',
      model: 'claude-haiku-4-5',
    });
    const published = await listPublishedEvents(db, { from: NOW });
    expect(published.items.map((i) => i.event.title)).toEqual(['Pizza social']);
  });

  it('is idempotent per content version: a second run makes no calls', async () => {
    await event('Pizza social', 'Free pizza for everyone');
    await run(mockAnthropic(fakeMessage(verdictJson({ evidence: 'Free pizza' }))));

    const create = mockAnthropic();
    const stats = await run(create);

    expect(create).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ rulesClassified: 0, llmPending: 0, llmCalls: 0 });
  });

  it('re-classifies when the content changes', async () => {
    const input = eventInput({
      title: 'Lunch talk',
      description: 'Lunch provided',
      startsAt: soon(2),
    });
    await upsertEvent(db, input, NOW);
    await run(
      mockAnthropic(fakeMessage(verdictJson({ evidence: 'Lunch provided', meal_type: 'lunch' }))),
    );
    await upsertEvent(db, { ...input, description: 'Lunch provided. Vegan options.' }, NOW);

    const create = mockAnthropic(
      fakeMessage(verdictJson({ evidence: 'Lunch provided', dietary: ['vegan'] })),
    );
    const stats = await run(create);

    expect(stats).toMatchObject({ rulesClassified: 1, llmCalls: 1, llmClassified: 1 });
    expect(await db.$count(classifications)).toBe(4);
  });

  it('flags for review after two invalid responses and does not retry that content next run', async () => {
    const e = await event('Pizza social', 'Free pizza for everyone');
    const create = mockAnthropic(fakeMessage('not json'), fakeMessage('still not json'));

    const stats = await run(create);

    expect(stats).toMatchObject({ llmCalls: 2, flagged: 1, llmClassified: 0 });
    expect(await db.select().from(reviewFlags)).toEqual([
      expect.objectContaining({
        eventId: e.id,
        contentHash: e.contentHash,
        reason: 'llm_invalid_output',
      }),
    ]);
    const queue = await listReviewQueue(db, NOW);
    expect(queue.map((q) => q.event.id)).toEqual([e.id]);

    const next = mockAnthropic();
    await run(next);
    expect(next).not.toHaveBeenCalled();
  });

  it('sends review-band verdicts to the review queue, not the site', async () => {
    await event('Maybe snacks?', 'There might be snacks');
    await run(
      mockAnthropic(fakeMessage(verdictJson({ confidence: 0.5, evidence: 'might be snacks' }))),
    );

    expect((await listPublishedEvents(db, { from: NOW })).items).toEqual([]);
    expect((await listReviewQueue(db, NOW)).map((q) => q.event.title)).toEqual(['Maybe snacks?']);
  });

  it('keeps unverified rules candidates hidden and out of the queue', async () => {
    const e = await event('Pizza social', 'Free pizza for everyone');

    const stats = await run(null);

    expect(stats).toMatchObject({ rulesCandidates: 1, llmPending: 1, llmCalls: 0 });
    expect(await getActiveClassification(db, e.id)).toMatchObject({
      method: 'rules',
      hasFreeFood: true,
      confidence: RULES_CANDIDATE_CONFIDENCE,
    });
    expect((await listPublishedEvents(db, { from: NOW })).items).toEqual([]);
    expect(await listReviewQueue(db, NOW)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY not set'));
  });

  it('stops at the per-run call cap, soonest events first, and defers the rest', async () => {
    for (const h of [3, 1, 2]) await event(`Pizza +${h}h`, 'Free pizza', h);
    const create = vi.fn<CreateMessage>(() =>
      Promise.resolve(fakeMessage(verdictJson({ evidence: 'Free pizza' }))),
    );

    const stats = await run(create, 2);

    expect(create).toHaveBeenCalledTimes(2);
    expect(stats).toMatchObject({ llmCalls: 2, llmClassified: 2, deferred: 1 });
    const done = await db
      .select({ id: classifications.eventId })
      .from(classifications)
      .where(sql`${classifications.method} = 'llm'`);
    expect(done).toHaveLength(2);
    // The deferred event is picked up next run.
    const next = mockAnthropic(fakeMessage(verdictJson({ evidence: 'Free pizza' })));
    expect(await run(next)).toMatchObject({ llmClassified: 1 });
  });

  it('never has more than 3 requests in flight', async () => {
    for (let i = 0; i < 8; i++) await event(`Pizza ${i}`, 'Free pizza', i + 1);
    let inFlight = 0;
    let peak = 0;
    const create = vi.fn<CreateMessage>(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return fakeMessage(verdictJson({ evidence: 'Free pizza' }));
    });

    await run(create);

    expect(create).toHaveBeenCalledTimes(8);
    expect(peak).toBe(3);
  });

  it('counts API errors without flagging, and stops calling after an auth error', async () => {
    for (let i = 0; i < 5; i++) await event(`Pizza ${i}`, 'Free pizza', i + 1);
    const create = vi.fn<CreateMessage>(() =>
      Promise.reject(
        new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', new Headers()),
      ),
    );

    const stats = await run(create);

    expect(stats.flagged).toBe(0);
    expect(stats.llmErrors).toBeGreaterThanOrEqual(1);
    // Up to 3 were already in flight when the first auth error landed; the rest never start.
    expect(create.mock.calls.length).toBeLessThanOrEqual(3);
    expect(await db.$count(reviewFlags)).toBe(0);
  });
});
