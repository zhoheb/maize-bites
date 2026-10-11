import { CAMPUS_TIME_ZONE, startOfNextLocalDay } from '@maize-bites/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database, DbHandle } from '../client.js';
import { listPublishedEvents } from '../queries/events.js';
import { classifications, events, reports, users } from '../schema.js';
import { createTestDb, eventInput } from '../testing.js';
import { upsertEvent } from '../queries/events.js';
import {
  DEMO_TITLE_PREFIX,
  assertDemoSeedAllowed,
  buildDemoEvents,
  clearDemoEvents,
  seedDemoEvents,
} from './demo.js';
import { seedBuildings } from './seed-buildings.js';

const LOCAL = 'postgres://maize:change-me@localhost:5432/maize_bites';
/** Thu Oct 1 2026, 1:45 PM in Ann Arbor. */
const AFTERNOON = new Date('2026-10-01T17:45:00Z');
/** The same day at 1:45 AM. */
const SMALL_HOURS = new Date('2026-10-01T05:45:00Z');

describe('assertDemoSeedAllowed', () => {
  it('allows a local development database', () => {
    expect(() => {
      assertDemoSeedAllowed({ DATABASE_URL: LOCAL });
    }).not.toThrow();
    expect(() => {
      assertDemoSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: LOCAL.replace('localhost', '127.0.0.1'),
      });
    }).not.toThrow();
  });

  it('refuses in production, whatever the database', () => {
    expect(() => {
      assertDemoSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: LOCAL });
    }).toThrow(/NODE_ENV is "production"/);
  });

  it('refuses a database that is not on this machine', () => {
    expect(() => {
      assertDemoSeedAllowed({
        DATABASE_URL: 'postgres://u:p@ep-cool-name.us-east-2.aws.neon.tech/maize',
      });
    }).toThrow(/points at ep-cool-name\.us-east-2\.aws\.neon\.tech/);
  });
});

describe('buildDemoEvents', () => {
  it.each([
    ['afternoon', AFTERNOON],
    ['small hours', SMALL_HOURS],
  ])('gives 20 upcoming events with three live now and one starting soon (%s)', (_label, now) => {
    const demo = buildDemoEvents(now);
    expect(demo).toHaveLength(20);
    expect(demo.every((d) => d.endsAt > now && d.endsAt > d.startsAt)).toBe(true);
    expect(demo.filter((d) => d.startsAt <= now)).toHaveLength(3);
    const soon = demo.filter(
      (d) => d.startsAt > now && d.startsAt.getTime() - now.getTime() <= 3_600_000,
    );
    expect(soon.map((d) => d.title)).toContain('Tacos before the watch party');
    // Everything falls inside the week the site's "This week" tab shows, give or take a day.
    const latest = Math.max(...demo.map((d) => d.startsAt.getTime()));
    expect(latest - now.getTime()).toBeLessThan(8 * 24 * 3_600_000);
  });

  it('keeps several events on the current local day', () => {
    const endOfToday = startOfNextLocalDay(SMALL_HOURS, CAMPUS_TIME_ZONE);
    expect(buildDemoEvents(SMALL_HOURS).filter((d) => d.startsAt < endOfToday).length).toBe(12);
  });
});

describe('seedDemoEvents', () => {
  let handle: DbHandle;
  let db: Database;
  beforeEach(async () => {
    handle = await createTestDb();
    db = handle.db;
  });
  afterEach(async () => {
    await handle.close();
  });

  it('needs the buildings first', async () => {
    await expect(seedDemoEvents(db, AFTERNOON)).rejects.toThrow(/run pnpm db:seed first/);
  });

  it('publishes clearly marked events across Central and North campus', async () => {
    await seedBuildings(db);

    expect(await seedDemoEvents(db, AFTERNOON)).toBe(20);

    const rows = await db.select().from(events);
    expect(rows).toHaveLength(20);
    expect(rows.every((e) => e.source === 'submission')).toBe(true);
    expect(rows.every((e) => e.title.startsWith(DEMO_TITLE_PREFIX))).toBe(true);
    expect(rows.every((e) => e.sourceEventId.startsWith('demo-'))).toBe(true);
    expect(rows.every((e) => e.description?.includes('This is demo data'))).toBe(true);

    const { items } = await listPublishedEvents(db, { from: AFTERNOON, limit: 100 });
    expect(items).toHaveLength(20);
    const campuses = items.map((i) => i.building?.campus);
    expect(campuses.filter((c) => c === 'central').length).toBeGreaterThanOrEqual(5);
    expect(campuses.filter((c) => c === 'north').length).toBeGreaterThanOrEqual(5);
    // One listing names no food at all, so the site can be seen handling that.
    expect(items.filter((i) => (i.classification?.foodItems.length ?? 0) === 0)).toHaveLength(1);
  });

  it('marks one live event likely over, with three fresh reports', async () => {
    await seedBuildings(db);
    await seedDemoEvents(db, AFTERNOON);
    const later = new Date(AFTERNOON.getTime() + 20 * 60_000);
    await seedDemoEvents(db, later);

    const { items } = await listPublishedEvents(db, {
      from: later,
      limit: 100,
      reportsSince: new Date(later.getTime() - 3_600_000),
    });
    const gone = items.filter((i) => i.recentFoodGone >= 3);
    expect(gone.map((i) => i.event.title)).toEqual(['[demo] Cookies after the career fair']);
  });

  it('is idempotent, and clearing removes only demo events', async () => {
    await seedBuildings(db);
    const { event: real } = await upsertEvent(db, eventInput({ title: 'A real event' }));
    await seedDemoEvents(db, AFTERNOON);
    await seedDemoEvents(db, new Date(AFTERNOON.getTime() + 3_600_000));

    expect(await db.$count(events)).toBe(21);
    expect(await db.$count(classifications)).toBe(20);
    expect(await db.$count(reports)).toBe(3);

    expect(await clearDemoEvents(db)).toBe(20);
    expect(await db.select({ id: events.id }).from(events)).toEqual([{ id: real.id }]);
    expect(await db.$count(users)).toBe(0);
    expect(await db.$count(classifications, eq(classifications.method, 'manual'))).toBe(0);
  });
});
