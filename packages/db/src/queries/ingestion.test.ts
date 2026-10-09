import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database, DbHandle } from '../client.js';
import { events, ingestionRuns, locationMisses, notificationLog } from '../schema.js';
import { createTestDb, eventInput } from '../testing.js';
import { upsertUserByEmail } from './auth.js';
import { upsertEvent } from './events.js';
import {
  finishIngestionRun,
  getHttpValidators,
  getLastIngestionRun,
  getLastSuccessfulIngestion,
  hasFreshHappeningTwin,
  listSourceFreshness,
  markUnseenEventsRemoved,
  recordLocationMisses,
  retireDuplicateEvents,
  saveHttpValidators,
  startIngestionRun,
} from './ingestion.js';
import { claimNotification } from './notifications.js';

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

describe('markUnseenEventsRemoved', () => {
  const options = {
    source: 'happening' as const,
    seenBefore: hours(-24),
    now: NOW,
    windowEnd: hours(24 * 14),
  };

  async function seen(title: string, lastSeen: Date, extra: Parameters<typeof eventInput>[0] = {}) {
    await upsertEvent(db, eventInput({ title, startsAt: hours(5), ...extra }), lastSeen);
  }

  async function statuses() {
    const rows = await db.select({ title: events.title, status: events.status }).from(events);
    return Object.fromEntries(rows.map((r) => [r.title, r.status]));
  }

  it('removes upcoming events unseen for longer than the grace period', async () => {
    await seen('stale', hours(-25));
    await seen('fresh', hours(-23));

    expect(await markUnseenEventsRemoved(db, options)).toBe(1);
    expect(await statuses()).toEqual({ stale: 'removed', fresh: 'active' });
  });

  it('leaves events that already ended (they fall out of the feed naturally)', async () => {
    await seen('ended', hours(-48), { startsAt: hours(-30), endsAt: hours(-29) });
    await seen('ongoing', hours(-48), { startsAt: hours(-1), endsAt: hours(2) });

    await markUnseenEventsRemoved(db, options);

    expect(await statuses()).toEqual({ ended: 'active', ongoing: 'removed' });
  });

  it('leaves events beyond the fetched window and other sources and statuses', async () => {
    await seen('beyond window', hours(-48), { startsAt: hours(24 * 15) });
    await seen('submission', hours(-48), { source: 'submission' });
    await seen('cancelled', hours(-48), { status: 'cancelled' });

    expect(await markUnseenEventsRemoved(db, options)).toBe(0);
  });
});

describe('recordLocationMisses', () => {
  it('inserts new misses and accumulates counts on later runs', async () => {
    await recordLocationMisses(
      db,
      [{ normalizedName: 'lsa building', locationName: 'LSA Building', count: 3 }],
      hours(-1),
    );
    await recordLocationMisses(
      db,
      [
        { normalizedName: 'lsa building', locationName: 'LSA Bldg', count: 2 },
        { normalizedName: '202 s thayer', locationName: '202 S. Thayer', count: 1 },
      ],
      NOW,
    );

    const rows = await db.select().from(locationMisses).orderBy(locationMisses.normalizedName);
    expect(rows).toEqual([
      expect.objectContaining({ normalizedName: '202 s thayer', seenCount: 1, firstSeenAt: NOW }),
      expect.objectContaining({
        normalizedName: 'lsa building',
        locationName: 'LSA Bldg',
        seenCount: 5,
        firstSeenAt: hours(-1),
        lastSeenAt: NOW,
      }),
    ]);
  });

  it('is a no-op for an empty list', async () => {
    await recordLocationMisses(db, [], NOW);
    expect(await db.select().from(locationMisses)).toEqual([]);
  });
});

describe('ingestion runs', () => {
  it('records start, stats, and finish; reports the latest start', async () => {
    expect(await getLastIngestionRun(db, 'happening')).toBeNull();

    await startIngestionRun(db, 'happening', hours(-2));
    const id = await startIngestionRun(db, 'happening', hours(-1));
    await finishIngestionRun(db, id, NOW, {
      fetched: 10,
      created: 4,
      updated: 1,
      classified: 0,
      removed: 2,
      complete: true,
      errors: 1,
      errorMessages: ['bad item'],
    });

    expect((await getLastIngestionRun(db, 'happening'))?.startedAt).toEqual(hours(-1));
    const [row] = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, id));
    expect(row).toMatchObject({
      finishedAt: NOW,
      fetched: 10,
      removed: 2,
      complete: true,
      errorMessages: ['bad item'],
    });
  });
});

describe('getLastSuccessfulIngestion', () => {
  const stats = {
    fetched: 1,
    created: 1,
    updated: 0,
    classified: 0,
    removed: 0,
    errors: 0,
    errorMessages: [],
  };

  it('returns the finish time of the newest complete run, ignoring incomplete and unfinished ones', async () => {
    expect(await getLastSuccessfulIngestion(db)).toBeNull();

    const ok = await startIngestionRun(db, 'happening', hours(-3));
    await finishIngestionRun(db, ok, hours(-2.9), { ...stats, complete: true });
    const partial = await startIngestionRun(db, 'happening', hours(-2));
    await finishIngestionRun(db, partial, hours(-1.9), { ...stats, complete: false });
    await startIngestionRun(db, 'happening', hours(-1)); // still running / crashed

    expect(await getLastSuccessfulIngestion(db)).toEqual(hours(-2.9));
  });

  it('listSourceFreshness reports the newest run and newest success per source', async () => {
    expect(await listSourceFreshness(db)).toEqual([]);

    const ok = await startIngestionRun(db, 'happening', hours(-30));
    await finishIngestionRun(db, ok, hours(-29.9), { ...stats, complete: true });
    const failed = await startIngestionRun(db, 'happening', hours(-1));
    await finishIngestionRun(db, failed, hours(-0.9), { ...stats, complete: false });
    const never = await startIngestionRun(db, 'maizepages', hours(-2));
    await finishIngestionRun(db, never, hours(-1.9), { ...stats, complete: false });

    expect(await listSourceFreshness(db)).toEqual([
      { source: 'happening', lastRunAt: hours(-1), lastSuccessAt: hours(-29.9) },
      { source: 'maizepages', lastRunAt: hours(-2), lastSuccessAt: null },
    ]);
  });

  it('keeps sources apart', async () => {
    const happening = await startIngestionRun(db, 'happening', hours(-3));
    await finishIngestionRun(db, happening, hours(-2.9), { ...stats, complete: true });
    const maizepages = await startIngestionRun(db, 'maizepages', hours(-1));
    await finishIngestionRun(db, maizepages, hours(-0.9), {
      ...stats,
      complete: true,
      notModified: true,
      ttlMinutes: 300,
    });

    expect(await getLastSuccessfulIngestion(db, 'happening')).toEqual(hours(-2.9));
    expect(await getLastSuccessfulIngestion(db, 'maizepages')).toEqual(hours(-0.9));
    expect(await getLastSuccessfulIngestion(db)).toEqual(hours(-0.9));
    expect(await getLastIngestionRun(db, 'happening')).toEqual({
      startedAt: hours(-3),
      ttlMinutes: null,
    });
    expect(await getLastIngestionRun(db, 'maizepages')).toEqual({
      startedAt: hours(-1),
      ttlMinutes: 300,
    });
  });
});

describe('http validators', () => {
  const URL_ = 'https://maizepages.umich.edu/events.ics';

  it('stores and replaces the validators for a url', async () => {
    expect(await getHttpValidators(db, URL_)).toBeNull();

    await saveHttpValidators(db, URL_, { etag: '"a"', lastModified: null }, hours(-1));
    expect(await getHttpValidators(db, URL_)).toEqual({ etag: '"a"', lastModified: null });

    const lastModified = 'Fri, 09 Oct 2026 04:03:14 GMT';
    await saveHttpValidators(db, URL_, { etag: null, lastModified }, NOW);
    expect(await getHttpValidators(db, URL_)).toEqual({ etag: null, lastModified });
  });
});

describe('Maize Pages / Happening duplicates', () => {
  const MP_ID = '12668714';
  const happeningCopy = (extra: Parameters<typeof eventInput>[0] = {}) =>
    eventInput({ source: 'happening', maizepagesEventId: MP_ID, startsAt: hours(5), ...extra });
  const maizepagesOriginal = () =>
    eventInput({
      source: 'maizepages',
      sourceEventId: MP_ID,
      maizepagesEventId: MP_ID,
      startsAt: hours(5),
    });

  it('hasFreshHappeningTwin sees only active, recently seen Happening rows with that id', async () => {
    const since = hours(-24);
    expect(await hasFreshHappeningTwin(db, MP_ID, since)).toBe(false);

    await upsertEvent(db, maizepagesOriginal(), NOW);
    expect(await hasFreshHappeningTwin(db, MP_ID, since)).toBe(false);

    const copy = happeningCopy();
    await upsertEvent(db, { ...copy, status: 'removed' }, NOW);
    expect(await hasFreshHappeningTwin(db, MP_ID, since)).toBe(false);

    // Active, but the Happening feed last listed it two days ago.
    await upsertEvent(db, copy, hours(-48));
    expect(await hasFreshHappeningTwin(db, MP_ID, since)).toBe(false);

    await upsertEvent(db, copy, hours(-1));
    expect(await hasFreshHappeningTwin(db, MP_ID, since)).toBe(true);
    expect(await hasFreshHappeningTwin(db, '999', since)).toBe(false);
  });

  it('retireDuplicateEvents hides the Maize Pages row and carries its alert claims over', async () => {
    const { event: original } = await upsertEvent(db, maizepagesOriginal());
    const { event: copy } = await upsertEvent(db, happeningCopy());
    const user = await upsertUserByEmail(db, 'reader@umich.edu');
    const claim = { userId: user.id, channel: 'email', kind: 'instant', sentAt: NOW } as const;
    await claimNotification(db, { ...claim, eventId: original.id });
    const retire = () =>
      retireDuplicateEvents(db, {
        maizepagesEventId: MP_ID,
        source: 'maizepages',
        survivorId: copy.id,
      });

    expect(await retire()).toBe(1);

    const [row] = await db.select().from(events).where(eq(events.id, original.id));
    expect(row?.status).toBe('removed');
    // The alert already went out for the original, so the copy can't be claimed again.
    expect(await claimNotification(db, { ...claim, eventId: copy.id })).toBe(false);
    expect(await db.$count(notificationLog)).toBe(2);

    // Nothing left to retire the second time.
    expect(await retire()).toBe(0);
  });

  it('retireDuplicateEvents hides only stale Happening copies when given seenBefore', async () => {
    const { event: original } = await upsertEvent(db, maizepagesOriginal(), NOW);
    const { event: stale } = await upsertEvent(db, happeningCopy(), hours(-48));
    const { event: fresh } = await upsertEvent(db, happeningCopy(), hours(-1));

    const hidden = await retireDuplicateEvents(db, {
      maizepagesEventId: MP_ID,
      source: 'happening',
      survivorId: original.id,
      seenBefore: hours(-24),
    });

    expect(hidden).toBe(1);
    const status = async (id: string) =>
      (await db.select().from(events).where(eq(events.id, id)))[0]?.status;
    expect(await status(stale.id)).toBe('removed');
    expect(await status(fresh.id)).toBe('active');
    expect(await status(original.id)).toBe('active');
  });

  it('retireDuplicateEvents leaves other events alone', async () => {
    const { event: other } = await upsertEvent(
      db,
      eventInput({
        source: 'maizepages',
        sourceEventId: '555',
        maizepagesEventId: '555',
        startsAt: hours(5),
      }),
    );
    const { event: copy } = await upsertEvent(db, happeningCopy());

    expect(
      await retireDuplicateEvents(db, {
        maizepagesEventId: MP_ID,
        source: 'maizepages',
        survivorId: copy.id,
      }),
    ).toBe(0);
    const [row] = await db.select().from(events).where(eq(events.id, other.id));
    expect(row?.status).toBe('active');
  });
});
