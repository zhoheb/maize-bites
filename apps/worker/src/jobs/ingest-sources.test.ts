import {
  addBuildingAlias,
  buildings,
  claimNotification,
  events,
  ingestionRuns,
  seedBuildings,
  sql,
  upsertUserByEmail,
  type Database,
  type DbHandle,
} from '@maize-bites/db';
import { createTestDb } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyPendingEvents } from '../classifier/classify-events.js';
import type { FeedWindow } from '../sources/happening/client.js';
import { createHappeningSource } from '../sources/happening/index.js';
import { FeedHttpError } from '../sources/http/client.js';
import { createMaizepagesSource } from '../sources/maizepages/index.js';
import type { Source } from '../sources/types.js';
import { maizepagesIcs, sampleFeed } from '../test/fixture.js';
import { ingestIfDue, relinkLocations, runIngestion, type IngestDeps } from './ingest.js';

// The Maize Pages fixture covers 2026-10-09 to 2026-10-16.
const NOW = new Date('2026-10-09T04:10:00Z');
const at = (minutes: number) => () => new Date(NOW.getTime() + minutes * 60_000);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** A real Maize Pages event from the fixture, and a real Happening item imported from Maize Pages. */
const MP_ID = '12768062';
const [happeningImport] = (sampleFeed as Record<string, unknown>[]).filter(
  (item) => item['maizepages_import'],
);

/** The Happening copy of fixture event MP_ID: a real imported item, re-pointed and moved into range. */
function happeningCopy(): Record<string, unknown> {
  return {
    ...happeningImport,
    id: '900001-1',
    datetime_start: '20261009T080000',
    datetime_end: '20261009T170000',
    has_end_time: 1,
    website: `https://maizepages.umich.edu/event/${MP_ID}`,
    links: [],
    maizepages_import: {
      ...(happeningImport?.['maizepages_import'] as object),
      maizepages_event_id: Number(MP_ID),
    },
  };
}

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  await seedBuildings(db);
  for (const fn of Object.values(logger)) fn.mockReset();
});
afterEach(async () => {
  await handle.close();
});

function happening(items: unknown[] | Error): Source {
  return createHappeningSource({
    fetchWindow: (from): Promise<FeedWindow> =>
      items instanceof Error
        ? Promise.reject(items)
        : Promise.resolve({
            items,
            complete: true,
            pages: 1,
            windowStart: from,
            windowEnd: new Date(from.getTime() + 14 * 86_400_000),
          }),
  });
}

/** The Maize Pages source over a scripted list of HTTP responses. */
function maizepages(...responses: (Response | Error)[]) {
  const fetchFn = vi.fn((..._args: Parameters<typeof fetch>) => {
    const next = responses.shift();
    if (next === undefined) throw new Error('unexpected extra request');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const stored = new Map<string, { etag: string | null; lastModified: string | null }>();
  const source = createMaizepagesSource({
    http: { userAgent: 'MaizeBites/0.1 (test)', fetchFn, maxAttempts: 1, logger },
    logger,
    validators: {
      get: (url) => Promise.resolve(stored.get(url) ?? null),
      save: (url, v) => {
        stored.set(url, v);
        return Promise.resolve();
      },
    },
  });
  return { source, fetchFn };
}

const ics = (headers: Record<string, string> = {}) => new Response(maizepagesIcs, { headers });

const deps = (sources: Source[], overrides: Partial<IngestDeps> = {}): IngestDeps => ({
  db,
  logger,
  now: () => NOW,
  sources,
  ...overrides,
});

const rowsFor = (id: string) =>
  db
    .select({ id: events.id, source: events.source, status: events.status })
    .from(events)
    .where(sql`${events.maizepagesEventId} = ${id}`);

describe('Maize Pages ingestion from the captured feed', () => {
  it('creates one event per item, with coordinates, buildings, and a run row', async () => {
    const [result] = await runIngestion(deps([maizepages(ics()).source]));

    expect(result).toMatchObject({
      source: 'maizepages',
      fetched: 27,
      created: 27,
      skippedDuplicates: 0,
      errors: 0,
      complete: true,
      notModified: false,
    });
    const rows = await db.select().from(events);
    expect(rows).toHaveLength(27);
    expect(rows.every((e) => e.source === 'maizepages' && e.occurrenceId === '0')).toBe(true);
    expect(rows.every((e) => e.maizepagesEventId === e.sourceEventId)).toBe(true);
    expect(rows.filter((e) => e.status === 'cancelled')).toHaveLength(4);
    expect(rows.filter((e) => e.lat !== null).length).toBeGreaterThan(10);
    expect(rows.some((e) => e.buildingId !== null)).toBe(true);
    expect(result?.locationMisses).toBeGreaterThan(0);

    const [run] = await db.select().from(ingestionRuns);
    expect(run).toMatchObject({ source: 'maizepages', fetched: 27, created: 27, complete: true });
  });

  it('is idempotent across runs', async () => {
    await runIngestion(deps([maizepages(ics()).source]));
    const [second] = await runIngestion(deps([maizepages(ics()).source], { now: at(300) }));
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 27, removed: 0 });
    expect(await db.$count(events)).toBe(27);
  });

  it('records a 304 as a complete, not-modified run that touches nothing', async () => {
    const { source } = maizepages(ics({ ETag: '"v1"' }), new Response(null, { status: 304 }));
    await runIngestion(deps([source]));
    const before = await db.select().from(events).orderBy(events.id);

    const [second] = await runIngestion(deps([source], { now: at(300) }));

    expect(second).toMatchObject({ notModified: true, complete: true, fetched: 0, removed: 0 });
    expect(await db.select().from(events).orderBy(events.id)).toEqual(before);
  });

  it('classifies Maize Pages events and counts them on its own run', async () => {
    const [result] = await runIngestion(
      deps([maizepages(ics()).source], {
        classify: (now) => classifyPendingEvents({ db, logger, now, llm: null }),
      }),
    );
    expect(result?.classified).toBeGreaterThan(0);
    const [run] = await db.select().from(ingestionRuns);
    expect(run?.classified).toBe(result?.classified);
  });
});

describe('duplicates between Happening and Maize Pages', () => {
  it('Happening first: the Maize Pages copy is skipped', async () => {
    await runIngestion(deps([happening([happeningCopy()])]));

    const [result] = await runIngestion(deps([maizepages(ics()).source], { now: at(60) }));

    expect(result).toMatchObject({ fetched: 27, created: 26, skippedDuplicates: 1, errors: 0 });
    expect(await rowsFor(MP_ID)).toEqual([
      expect.objectContaining({ source: 'happening', status: 'active' }),
    ]);
  });

  it('Maize Pages first: its copy is retired when the Happening one arrives', async () => {
    await runIngestion(deps([maizepages(ics()).source]));
    const [original] = await rowsFor(MP_ID);
    const user = await upsertUserByEmail(db, 'reader@umich.edu');
    const claim = { userId: user.id, channel: 'email', kind: 'instant', sentAt: NOW } as const;
    await claimNotification(db, { ...claim, eventId: original?.id ?? '' });

    await runIngestion(deps([happening([happeningCopy()])], { now: at(60) }));

    const rows = await rowsFor(MP_ID);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === 'active')).toEqual([
      expect.objectContaining({ source: 'happening' }),
    ]);
    // The alert that went out for the Maize Pages copy also covers the Happening one.
    const copy = rows.find((r) => r.source === 'happening');
    expect(await claimNotification(db, { ...claim, eventId: copy?.id ?? '' })).toBe(false);

    // The retired copy stays retired on the next Maize Pages poll.
    const [again] = await runIngestion(deps([maizepages(ics()).source], { now: at(360) }));
    expect(again).toMatchObject({ skippedDuplicates: 1, created: 0 });
    expect((await rowsFor(MP_ID)).filter((r) => r.status === 'active')).toHaveLength(1);
  });

  it('both in one pass, in either order, leave exactly one active event', async () => {
    for (const order of ['happening-first', 'maizepages-first'] as const) {
      await db.delete(events);
      const sources = [happening([happeningCopy()]), maizepages(ics()).source];
      if (order === 'maizepages-first') sources.reverse();

      await runIngestion(deps(sources));

      const active = (await rowsFor(MP_ID)).filter((r) => r.status === 'active');
      expect(active, order).toEqual([expect.objectContaining({ source: 'happening' })]);
    }
  });

  it('brings the Maize Pages copy back if Happening drops the event', async () => {
    await runIngestion(deps([happening([happeningCopy()]), maizepages(ics()).source]));
    await db
      .update(events)
      .set({ status: 'removed' })
      .where(sql`${events.source} = 'happening'`);

    const [result] = await runIngestion(deps([maizepages(ics()).source], { now: at(300) }));

    expect(result).toMatchObject({ skippedDuplicates: 0, created: 1 });
    expect((await rowsFor(MP_ID)).filter((r) => r.status === 'active')).toEqual([
      expect.objectContaining({ source: 'maizepages' }),
    ]);
  });
  it('lets Maize Pages take over a copy Happening has not listed for a day, and hands it back later', async () => {
    // Happening lists the event, then becomes unreachable.
    await runIngestion(deps([happening([happeningCopy()])]));
    const twoDays = 2 * 24 * 60;

    const [takeover] = await runIngestion(deps([maizepages(ics()).source], { now: at(twoDays) }));

    expect(takeover).toMatchObject({ skippedDuplicates: 0, created: 27 });
    expect((await rowsFor(MP_ID)).filter((r) => r.status === 'active')).toEqual([
      expect.objectContaining({ source: 'maizepages' }),
    ]);

    // Happening comes back and lists it again: its copy is the event once more.
    await runIngestion(deps([happening([happeningCopy()])], { now: at(twoDays + 60) }));

    expect((await rowsFor(MP_ID)).filter((r) => r.status === 'active')).toEqual([
      expect.objectContaining({ source: 'happening' }),
    ]);
    expect(await rowsFor(MP_ID)).toHaveLength(2);
  });
});

describe('failure isolation', () => {
  const challenge = () =>
    new FeedHttpError(
      'GET /list/json → HTTP 403 (blocked by a Cloudflare challenge)',
      false,
      'challenge',
    );

  it('a challenged Happening does not stop Maize Pages, and each gets its own run row', async () => {
    const results = await runIngestion(deps([happening(challenge()), maizepages(ics()).source]));

    expect(results.map((r) => [r.source, r.complete, r.created, r.errors])).toEqual([
      ['happening', false, 0, 1],
      ['maizepages', true, 27, 0],
    ]);
    expect(results[0]?.errorMessages[0]).toMatch(/fetch failed: .*Cloudflare challenge/);

    const runs = await db.select().from(ingestionRuns).orderBy(ingestionRuns.source);
    expect(runs.map((r) => [r.source, r.complete, r.fetched, r.errors])).toEqual([
      ['happening', false, 0, 1],
      ['maizepages', true, 27, 0],
    ]);
    expect(runs.every((r) => r.finishedAt !== null)).toBe(true);
  });

  it('a failing Maize Pages does not stop Happening', async () => {
    const { source } = maizepages(new Response('', { status: 500 }), new Error('socket hang up'));
    const results = await runIngestion(deps([source, happening(sampleFeed.slice(0, 5))]));

    expect(results.map((r) => [r.source, r.complete, r.created])).toEqual([
      ['maizepages', false, 0],
      ['happening', true, 5],
    ]);
  });

  it('a source that throws outside its fetch is recorded and the pass carries on', async () => {
    const broken: Source = {
      ...happening([{ ...(sampleFeed[0] as object) }]),
      normalize: () => {
        throw new Error('normalizer bug');
      },
    };
    const results = await runIngestion(deps([broken, maizepages(ics()).source]));

    expect(results[0]).toMatchObject({ complete: false, errors: 1 });
    expect(results[0]?.errorMessages).toEqual(['ingest failed: normalizer bug']);
    expect(results[1]).toMatchObject({ source: 'maizepages', complete: true, created: 27 });
  });

  it('still classifies what was ingested when one source failed', async () => {
    const classify = vi.fn((now: Date) => classifyPendingEvents({ db, logger, now, llm: null }));
    const results = await runIngestion(
      deps([happening(challenge()), maizepages(ics()).source], { classify }),
    );

    expect(classify).toHaveBeenCalledTimes(1);
    expect(results[0]?.classified).toBe(0);
    expect(results[1]?.classified).toBeGreaterThan(0);
  });
});

describe('per-source schedule', () => {
  it('runs Happening hourly and Maize Pages only every five hours', async () => {
    const mp = maizepages(ics(), ics());
    const sources = () => [happening([]), mp.source];

    const first = await ingestIfDue(deps(sources()));
    expect(first.status === 'ran' && first.results.map((r) => r.source)).toEqual([
      'happening',
      'maizepages',
    ]);

    // Half an hour later nothing is due; the next source due is Happening.
    expect(await ingestIfDue(deps(sources(), { now: at(30) }))).toEqual({
      status: 'skipped',
      nextAllowedAt: at(59)(),
    });

    // An hour later only Happening runs.
    const hourly = await ingestIfDue(deps(sources(), { now: at(60) }));
    expect(hourly).toMatchObject({
      status: 'ran',
      results: [{ source: 'happening' }],
      skipped: [{ source: 'maizepages', nextAllowedAt: at(299)() }],
    });
    expect(mp.fetchFn).toHaveBeenCalledTimes(1);

    // Five hours after its first run, Maize Pages is due again.
    const later = await ingestIfDue(deps(sources(), { now: at(300) }));
    expect(later.status === 'ran' && later.results.map((r) => r.source)).toEqual([
      'happening',
      'maizepages',
    ]);
    expect(mp.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('waits for a longer ttl when the RSS feed states one', async () => {
    const source: Source = {
      ...maizepages().source,
      fetch: (from) =>
        Promise.resolve({
          status: 'ok',
          items: [],
          complete: true,
          windowEnd: from,
          ttlMinutes: 600,
        }),
    };

    await ingestIfDue(deps([source]));
    const [run] = await db.select().from(ingestionRuns);
    expect(run?.ttlMinutes).toBe(600);

    expect(await ingestIfDue(deps([source], { now: at(400) }))).toEqual({
      status: 'skipped',
      nextAllowedAt: at(599)(),
    });
    expect((await ingestIfDue(deps([source], { now: at(599) }))).status).toBe('ran');
  });
});

describe('a pass with nothing to fetch', () => {
  it('still classifies and alerts when no source is due', async () => {
    const mp = maizepages(ics());
    await ingestIfDue(deps([mp.source]));
    const classify = vi.fn((now: Date) =>
      classifyPendingEvents({ db, logger, now, llm: null, mode: 'rules' }),
    );
    const notify = vi.fn(() => Promise.resolve({ sent: 0, failed: 0 } as never));

    const outcome = await ingestIfDue(deps([mp.source], { now: at(30), classify, notify }));

    expect(outcome.status).toBe('skipped');
    expect(mp.fetchFn).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    // No new run row: nothing was fetched.
    expect(await db.$count(ingestionRuns)).toBe(1);
  });

  it('runs with no sources at all, and logs a classifier failure instead of losing it', async () => {
    const outcome = await ingestIfDue(
      deps([], { classify: () => Promise.reject(new Error('db hiccup')) }),
    );
    expect(outcome.status).toBe('skipped');
    expect(logger.error).toHaveBeenCalledWith('[ingest] classification failed: db hiccup');
  });
});

describe('relinkLocations', () => {
  it('places stored events once their location gains a building alias', async () => {
    await runIngestion(deps([maizepages(ics()).source]));
    const unplaced = () => db.$count(events, sql`${events.buildingId} is null`);
    const before = await unplaced();
    const [neal] = await db
      .select()
      .from(events)
      .where(sql`${events.locationName} = 'Neal Lab'`);
    expect(neal?.buildingId).toBeNull();
    expect(await relinkLocations(db, NOW)).toBe(0);

    const [chemistry] = await db
      .select()
      .from(buildings)
      .where(sql`${buildings.name} = 'Chemistry Building'`);
    await addBuildingAlias(db, chemistry?.id ?? '', 'Neal Lab');

    expect(await relinkLocations(db, NOW)).toBe(1);
    expect(await unplaced()).toBe(before - 1);
    const [placed] = await db
      .select()
      .from(events)
      .where(sql`${events.locationName} = 'Neal Lab'`);
    expect(placed?.buildingId).toBe(chemistry?.id);
  });
});
