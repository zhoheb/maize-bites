import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database, DbHandle } from '../client.js';
import { events, ingestionRuns, locationMisses } from '../schema.js';
import { createTestDb, eventInput } from '../testing.js';
import { upsertEvent } from './events.js';
import {
  finishIngestionRun,
  getLastIngestionRunStart,
  getLastSuccessfulIngestion,
  markUnseenEventsRemoved,
  recordLocationMisses,
  startIngestionRun,
} from './ingestion.js';

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
    expect(await getLastIngestionRunStart(db)).toBeNull();

    await startIngestionRun(db, hours(-2));
    const id = await startIngestionRun(db, hours(-1));
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

    expect(await getLastIngestionRunStart(db)).toEqual(hours(-1));
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

    const ok = await startIngestionRun(db, hours(-3));
    await finishIngestionRun(db, ok, hours(-2.9), { ...stats, complete: true });
    const partial = await startIngestionRun(db, hours(-2));
    await finishIngestionRun(db, partial, hours(-1.9), { ...stats, complete: false });
    await startIngestionRun(db, hours(-1)); // still running / crashed

    expect(await getLastSuccessfulIngestion(db)).toEqual(hours(-2.9));
  });
});
