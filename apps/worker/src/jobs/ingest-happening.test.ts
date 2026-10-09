import {
  classifications,
  events,
  ingestionRuns,
  locationMisses,
  seedBuildings,
  sql,
  upsertEvent,
  type Database,
  type DbHandle,
} from '@maize-bites/db';
import { createTestDb, eventInput } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyPendingEvents } from '../classifier/classify-events.js';
import type { FeedWindow } from '../sources/happening/client.js';
import { fakeMessage, mockAnthropic, verdictJson } from '../test/anthropic-mock.js';
import { sampleFeed } from '../test/fixture.js';
import {
  MIN_INGEST_INTERVAL_MS,
  REMOVAL_GRACE_MS,
  ingestIfDue,
  isIngestionDue,
  runIngestion,
  type IngestDeps,
} from './ingest-happening.js';

// Fixture items start 2026-09-23 through 2026-10-01; "now" sits inside that span.
const NOW = new Date('2026-09-30T16:00:00Z');
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  await seedBuildings(db);
  logger.info.mockReset();
  logger.error.mockReset();
});

afterEach(async () => {
  await handle.close();
});

function windowOf(items: unknown[], complete = true): FeedWindow {
  return {
    items,
    complete,
    pages: 1,
    windowStart: NOW,
    windowEnd: new Date(NOW.getTime() + 14 * 86_400_000),
  };
}

function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    db,
    logger,
    now: () => NOW,
    fetchWindow: () => Promise.resolve(windowOf(sampleFeed)),
    ...overrides,
  };
}

const at = (ms: number) => () => new Date(NOW.getTime() + ms);

describe('runIngestion with the captured feed', () => {
  it('creates one event per feed item and records the run', async () => {
    const result = await runIngestion(deps());

    expect(result).toMatchObject({
      fetched: 200,
      created: 200,
      updated: 0,
      unchanged: 0,
      errors: 0,
      complete: true,
    });
    expect(await db.$count(events)).toBe(200);

    const [run] = await db.select().from(ingestionRuns);
    expect(run).toMatchObject({
      id: result.runId,
      startedAt: NOW,
      fetched: 200,
      created: 200,
      complete: true,
    });
    expect(run?.finishedAt).toEqual(NOW);
  });

  it('is idempotent: a second run over the same feed changes nothing but last_seen_at', async () => {
    await runIngestion(deps());
    const before = await db.select().from(events).orderBy(events.id);

    const second = await runIngestion(deps({ now: at(3_600_000) }));

    expect(second).toMatchObject({
      fetched: 200,
      created: 0,
      updated: 0,
      unchanged: 200,
      removed: 0,
      errors: 0,
    });
    const after = await db.select().from(events).orderBy(events.id);
    expect(after).toHaveLength(200);
    expect(after.map(({ lastSeenAt: _l, ...rest }) => rest)).toEqual(
      before.map(({ lastSeenAt: _l, ...rest }) => rest),
    );
    expect(after.every((e) => e.lastSeenAt.getTime() === NOW.getTime() + 3_600_000)).toBe(true);
    expect(await db.$count(ingestionRuns)).toBe(2);
  });

  it('resolves buildings and logs unmatched location names', async () => {
    const result = await runIngestion(deps());

    const matched = await db.$count(events, sql`${events.buildingId} is not null`);
    expect(matched).toBe(70);

    const misses = await db.select().from(locationMisses);
    expect(result.locationMisses).toBe(misses.length);
    expect(misses).toContainEqual(
      expect.objectContaining({
        normalizedName: 'east hall',
        locationName: 'East Hall',
        seenCount: 7,
      }),
    );
    expect(misses.map((m) => m.normalizedName)).not.toContain('off campus location');
  });

  it('counts an updated event when its content changes', async () => {
    await runIngestion(deps());
    const [first, ...rest] = sampleFeed as Record<string, unknown>[];
    const edited = [{ ...first, combined_title: 'Now with free pizza' }, ...rest];

    const result = await runIngestion(
      deps({ now: at(3_600_000), fetchWindow: () => Promise.resolve(windowOf(edited)) }),
    );

    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 199 });
  });

  it('records invalid items as errors without stopping the run', async () => {
    const items = [...sampleFeed.slice(0, 3), { id: 'not-an-id' }, 'garbage'];

    const result = await runIngestion(
      deps({ fetchWindow: () => Promise.resolve(windowOf(items)) }),
    );

    expect(result).toMatchObject({ fetched: 5, created: 3, errors: 2, complete: true });
    expect(result.errorMessages).toHaveLength(2);
    expect(result.errorMessages[1]).toMatch(/^item #4 failed validation/);
  });
});

describe('classification step', () => {
  it('classifies new content after upserting and counts it on the run', async () => {
    const result = await runIngestion(
      deps({ classify: (now) => classifyPendingEvents({ db, logger, now, llm: null }) }),
    );

    // Rules only (no LLM): one verdict per live event.
    const live = await db.$count(classifications);
    expect(result.classified).toBe(live);
    expect(live).toBeGreaterThan(0);
    const [run] = await db.select().from(ingestionRuns);
    expect(run?.classified).toBe(live);
  });

  it('counts rules and LLM verdicts together', async () => {
    const [first] = sampleFeed as Record<string, unknown>[];
    // Live at NOW (12:00 Ann Arbor time), and a rules candidate.
    const item = {
      ...first,
      combined_title: 'Free pizza night',
      datetime_start: '20260930T180000',
      datetime_end: '20260930T200000',
      has_end_time: 1,
    };

    const result = await runIngestion(
      deps({
        fetchWindow: () => Promise.resolve(windowOf([item])),
        classify: (now) =>
          classifyPendingEvents({
            db,
            logger,
            now,
            llm: {
              createMessage: mockAnthropic(fakeMessage(verdictJson({ evidence: 'Free pizza' }))),
              maxCalls: 10,
            },
          }),
      }),
    );

    const rows = await db.select({ method: classifications.method }).from(classifications);
    expect(rows.map((r) => r.method).sort()).toEqual(['llm', 'rules']);
    expect(result.classified).toBe(2);
    const [run] = await db.select().from(ingestionRuns);
    expect(run?.classified).toBe(2);
  });

  it('records a classifier crash as a run error without losing the ingested events', async () => {
    const result = await runIngestion(
      deps({ classify: () => Promise.reject(new Error('db hiccup')) }),
    );

    expect(result).toMatchObject({ created: 200, classified: 0, errors: 1 });
    expect(result.errorMessages).toEqual(['classification failed: db hiccup']);
  });
});

describe('removals', () => {
  async function staleUpcomingEvent() {
    // Seen 25h ago, starts tomorrow, not in the current feed.
    const { event } = await upsertEvent(
      db,
      eventInput({ startsAt: new Date(NOW.getTime() + 86_400_000) }),
      new Date(NOW.getTime() - REMOVAL_GRACE_MS - 3_600_000),
    );
    return event;
  }

  it('marks events missing from a complete fetch for 24h as removed', async () => {
    const stale = await staleUpcomingEvent();

    const result = await runIngestion(deps());

    expect(result.removed).toBe(1);
    const [row] = await db
      .select({ status: events.status })
      .from(events)
      .where(sql`${events.id} = ${stale.id}`);
    expect(row?.status).toBe('removed');
  });

  it('removes nothing when the fetch was incomplete', async () => {
    await staleUpcomingEvent();

    const result = await runIngestion(
      deps({ fetchWindow: () => Promise.resolve(windowOf(sampleFeed, false)) }),
    );

    expect(result).toMatchObject({ removed: 0, complete: false, created: 200 });
    expect(result.errorMessages[0]).toMatch(/skipping removals/);
  });

  it('records a failed fetch as an incomplete run and removes nothing', async () => {
    await staleUpcomingEvent();

    const result = await runIngestion(
      deps({ fetchWindow: () => Promise.reject(new Error('HTTP 503')) }),
    );

    expect(result).toMatchObject({ fetched: 0, removed: 0, complete: false, errors: 1 });
    expect(result.errorMessages).toEqual(['fetch failed: HTTP 503']);
    const [run] = await db.select().from(ingestionRuns);
    expect(run?.finishedAt).toEqual(NOW);
  });
});

describe('at most hourly', () => {
  it('isIngestionDue', () => {
    expect(isIngestionDue(null, NOW)).toBe(true);
    expect(isIngestionDue(new Date(NOW.getTime() - MIN_INGEST_INTERVAL_MS), NOW)).toBe(true);
    expect(isIngestionDue(new Date(NOW.getTime() - MIN_INGEST_INTERVAL_MS + 1), NOW)).toBe(false);
  });

  it('ingestIfDue skips (without fetching) when a run started recently', async () => {
    await runIngestion(deps());
    const fetchWindow = vi.fn(() => Promise.resolve(windowOf(sampleFeed)));

    const soon = await ingestIfDue(deps({ now: at(30 * 60_000), fetchWindow }));
    expect(soon).toEqual({
      status: 'skipped',
      nextAllowedAt: new Date(NOW.getTime() + MIN_INGEST_INTERVAL_MS),
    });
    expect(fetchWindow).not.toHaveBeenCalled();

    const later = await ingestIfDue(deps({ now: at(60 * 60_000), fetchWindow }));
    expect(later.status).toBe('ran');
    expect(fetchWindow).toHaveBeenCalledTimes(1);
  });
});
