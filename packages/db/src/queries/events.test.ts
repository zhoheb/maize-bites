import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database, DbHandle } from '../client.js';
import { computeContentHash } from '../content-hash.js';
import { buildings, classifications, events, type BuildingRow, type EventRow } from '../schema.js';
import { createTestDb, eventInput, insertClassification } from '../testing.js';
import {
  getActiveClassification,
  getPublishedEvent,
  listPublishedEvents,
  pruneEndedEvents,
  upsertEvent,
  type PublishedEventFilters,
} from './events.js';

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
});

afterEach(async () => {
  await handle.close();
});

const T0 = new Date('2026-10-01T12:00:00Z');
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

async function insertBuilding(overrides: Partial<typeof buildings.$inferInsert> = {}) {
  const [row] = await db
    .insert(buildings)
    .values({
      name: 'Michigan Union',
      campus: 'central',
      lat: 42.27517,
      lng: -83.74151,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

/** Upserts an event and gives it a publishable classification. */
async function publishedEvent(
  input: Parameters<typeof eventInput>[0] = {},
  classification: Parameters<typeof insertClassification>[2] = {},
): Promise<EventRow> {
  const { event } = await upsertEvent(db, eventInput(input), T0);
  await insertClassification(db, event, classification);
  return event;
}

const titles = async (filters: PublishedEventFilters = {}) =>
  (await listPublishedEvents(db, filters)).items.map((i) => i.event.title);

// ---------------------------------------------------------------------------

describe('upsertEvent', () => {
  it('creates a new event with computed content hash and seen timestamps', async () => {
    const input = eventInput({ title: 'Pizza', description: 'Free slices', tags: ['Food'] });

    const { event, change } = await upsertEvent(db, input, T0);

    expect(change).toBe('created');
    expect(event).toMatchObject({
      title: 'Pizza',
      status: 'active',
      tags: ['Food'],
      contentHash: computeContentHash(input),
      firstSeenAt: T0,
      lastSeenAt: T0,
    });
  });

  it('is idempotent: same content reports unchanged and only bumps last_seen_at', async () => {
    const input = eventInput();
    const first = await upsertEvent(db, input, T0);

    const second = await upsertEvent(db, input, later(60));

    expect(second.change).toBe('unchanged');
    expect(second.event.id).toBe(first.event.id);
    expect(second.event.firstSeenAt).toEqual(T0);
    expect(second.event.lastSeenAt).toEqual(later(60));
    expect(await db.select().from(events)).toHaveLength(1);
  });

  it('reports updated and re-hashes when content fields change', async () => {
    const input = eventInput({ title: 'Snacks' });
    const first = await upsertEvent(db, input, T0);

    const second = await upsertEvent(db, { ...input, title: 'Snacks and boba' }, later(60));

    expect(second.change).toBe('updated');
    expect(second.event.title).toBe('Snacks and boba');
    expect(second.event.contentHash).not.toBe(first.event.contentHash);
  });

  it('treats non-content changes (tags, url) as unchanged but still stores them', async () => {
    const input = eventInput({ tags: ['Lecture'] });
    await upsertEvent(db, input, T0);

    const second = await upsertEvent(
      db,
      { ...input, tags: ['Lecture', 'Food'], url: 'https://x.test' },
      later(60),
    );

    expect(second.change).toBe('unchanged');
    expect(second.event.tags).toEqual(['Lecture', 'Food']);
    expect(second.event.url).toBe('https://x.test');
  });

  it('clears optional fields that the source no longer sends', async () => {
    const input = eventInput({ description: 'Bagels!', room: '1100' });
    await upsertEvent(db, input, T0);

    const { description: _d, room: _r, ...withoutOptional } = input;
    const second = await upsertEvent(db, withoutOptional, later(60));

    expect(second.event.description).toBeNull();
    expect(second.event.room).toBeNull();
    expect(second.change).toBe('updated');
  });

  it('reactivates an event previously marked removed', async () => {
    const input = eventInput();
    const { event } = await upsertEvent(db, input, T0);
    await db.update(events).set({ status: 'removed' });

    const second = await upsertEvent(db, input, later(60));

    expect(second.event.id).toBe(event.id);
    expect(second.event.status).toBe('active');
  });

  it('keeps occurrences of the same source event as separate rows', async () => {
    const base = eventInput();
    await upsertEvent(db, { ...base, occurrenceId: '1' }, T0);
    await upsertEvent(db, { ...base, occurrenceId: '2', startsAt: later(24 * 60) }, T0);

    expect(await db.select().from(events)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

describe('getActiveClassification', () => {
  it('returns null when the event has no classifications', async () => {
    const { event } = await upsertEvent(db, eventInput(), T0);
    expect(await getActiveClassification(db, event.id)).toBeNull();
  });

  it('returns the newest classification for the current content hash', async () => {
    const { event } = await upsertEvent(db, eventInput(), T0);
    await insertClassification(db, event, { method: 'rules', createdAt: T0 });
    const newest = await insertClassification(db, event, { method: 'llm', createdAt: later(1) });

    expect(await getActiveClassification(db, event.id)).toEqual(newest);
  });

  it('ignores classifications made against stale content', async () => {
    const input = eventInput({ title: 'Lunch' });
    const { event } = await upsertEvent(db, input, T0);
    await insertClassification(db, event);

    await upsertEvent(db, { ...input, title: 'Lunch (cancelled food)' }, later(60));

    expect(await getActiveClassification(db, event.id)).toBeNull();
  });

  it('prefers llm over rules when created at the same instant', async () => {
    const { event } = await upsertEvent(db, eventInput(), T0);
    const llm = await insertClassification(db, event, { method: 'llm', createdAt: T0 });
    await insertClassification(db, event, { method: 'rules', createdAt: T0 });

    expect((await getActiveClassification(db, event.id))?.id).toBe(llm.id);
  });

  it('lets manual win over newer machine verdicts, even for stale content', async () => {
    const input = eventInput({ title: 'Dinner' });
    const { event } = await upsertEvent(db, input, T0);
    const manual = await insertClassification(db, event, {
      method: 'manual',
      model: null,
      hasFreeFood: false,
      createdAt: T0,
    });
    const { event: updated } = await upsertEvent(db, { ...input, title: 'Dinner v2' }, later(60));
    await insertClassification(db, updated, { method: 'llm', createdAt: later(61) });

    expect((await getActiveClassification(db, event.id))?.id).toBe(manual.id);
  });

  it('uses the newest manual verdict when there are several', async () => {
    const { event } = await upsertEvent(db, eventInput(), T0);
    await insertClassification(db, event, { method: 'manual', hasFreeFood: false, createdAt: T0 });
    const newest = await insertClassification(db, event, {
      method: 'manual',
      hasFreeFood: true,
      createdAt: later(5),
    });

    expect((await getActiveClassification(db, event.id))?.id).toBe(newest.id);
  });
});

// ---------------------------------------------------------------------------

describe('listPublishedEvents', () => {
  describe('publish rule', () => {
    it('includes confident free-food verdicts and excludes everything else', async () => {
      await publishedEvent({ title: 'confident' }, { confidence: 0.7 });
      await publishedEvent({ title: 'review band' }, { confidence: 0.69 });
      await publishedEvent({ title: 'no food' }, { hasFreeFood: false });
      await publishedEvent({ title: 'cancelled', status: 'cancelled' });
      await publishedEvent({ title: 'removed', status: 'removed' });
      await upsertEvent(db, eventInput({ title: 'unclassified' }), T0);

      expect(await titles()).toEqual(['confident']);
    });

    it('publishes manual approvals regardless of confidence', async () => {
      await publishedEvent({ title: 'manual yes' }, { method: 'manual', confidence: 0.1 });
      expect(await titles()).toEqual(['manual yes']);
    });

    it('hides events a manual verdict rejected, despite a confident llm verdict', async () => {
      const event = await publishedEvent({ title: 'overridden' }, { createdAt: later(10) });
      await insertClassification(db, event, {
        method: 'manual',
        hasFreeFood: false,
        createdAt: T0,
      });

      expect(await titles()).toEqual([]);
    });

    it('hides events whose content changed until they are re-classified', async () => {
      const input = eventInput({ title: 'Brunch' });
      const { event } = await upsertEvent(db, input, T0);
      await insertClassification(db, event);
      const { event: changed } = await upsertEvent(db, { ...input, title: 'Brunch?' }, later(60));

      expect(await titles()).toEqual([]);

      await insertClassification(db, changed);
      expect(await titles()).toEqual(['Brunch?']);
    });

    it('returns the event with its active classification and building', async () => {
      const building = await insertBuilding();
      const event = await publishedEvent(
        { title: 'Tacos', buildingId: building.id },
        { foodItems: ['tacos'], dietary: ['vegetarian'] },
      );

      const { items } = await listPublishedEvents(db);

      expect(items).toHaveLength(1);
      expect(items[0]?.event.id).toBe(event.id);
      expect(items[0]?.classification).toMatchObject({
        foodItems: ['tacos'],
        dietary: ['vegetarian'],
      });
      expect(items[0]?.building).toEqual<BuildingRow>(building);
    });
  });

  describe('filters', () => {
    it('from: keeps events that have not ended (1h default duration without ends_at)', async () => {
      await publishedEvent({ title: 'ended', startsAt: later(-120), endsAt: later(-60) });
      await publishedEvent({ title: 'ongoing', startsAt: later(-30), endsAt: later(30) });
      await publishedEvent({ title: 'no end, started 50m ago', startsAt: later(-50) });
      await publishedEvent({ title: 'no end, started 70m ago', startsAt: later(-70) });

      expect(await titles({ from: T0 })).toEqual(['no end, started 50m ago', 'ongoing']);
    });

    it('to: keeps events starting at or before the bound', async () => {
      await publishedEvent({ title: 'soon', startsAt: later(60) });
      await publishedEvent({ title: 'edge', startsAt: later(180) });
      await publishedEvent({ title: 'too late', startsAt: later(181) });

      expect(await titles({ to: later(180) })).toEqual(['soon', 'edge']);
    });

    it('campuses: matches on the building campus', async () => {
      const union = await insertBuilding();
      const dude = await insertBuilding({
        name: 'Duderstadt Center',
        campus: 'north',
        lat: 42.29118,
        lng: -83.71577,
      });
      await publishedEvent({ title: 'central', buildingId: union.id });
      await publishedEvent({ title: 'north', buildingId: dude.id });
      await publishedEvent({ title: 'no building' });

      expect(await titles({ campuses: ['north'] })).toEqual(['north']);
      expect((await titles({ campuses: ['central', 'north'] })).sort()).toEqual([
        'central',
        'north',
      ]);
      expect(await titles({ campuses: [] })).toHaveLength(3);
    });

    it('dietary: requires every requested tag', async () => {
      await publishedEvent(
        { title: 'vegan+gf' },
        { dietary: ['vegan', 'vegetarian', 'gluten_free'] },
      );
      await publishedEvent({ title: 'vegetarian' }, { dietary: ['vegetarian'] });
      await publishedEvent({ title: 'none' }, { dietary: [] });

      expect((await titles({ dietary: ['vegetarian'] })).sort()).toEqual([
        'vegan+gf',
        'vegetarian',
      ]);
      expect(await titles({ dietary: ['vegan', 'gluten_free'] })).toEqual(['vegan+gf']);
    });

    it('openOnly: excludes members-only, RSVP, and unknown audiences', async () => {
      await publishedEvent({ title: 'open' }, { audience: 'open' });
      await publishedEvent({ title: 'members' }, { audience: 'members' });
      await publishedEvent({ title: 'rsvp' }, { audience: 'rsvp' });
      await publishedEvent({ title: 'unknown' }, { audience: null });

      expect(await titles({ openOnly: true })).toEqual(['open']);
      expect(await titles({ openOnly: false })).toHaveLength(4);
    });

    it('mealType: matches exactly', async () => {
      await publishedEvent({ title: 'lunch' }, { mealType: 'lunch' });
      await publishedEvent({ title: 'snack' }, { mealType: 'snacks' });

      expect(await titles({ mealType: 'lunch' })).toEqual(['lunch']);
    });

    it('bbox: uses event coordinates, falling back to the building', async () => {
      const dude = await insertBuilding({
        name: 'Duderstadt Center',
        campus: 'north',
        lat: 42.29118,
        lng: -83.71577,
      });
      await publishedEvent({ title: 'central coords', lat: 42.2752, lng: -83.7415 });
      await publishedEvent({ title: 'north via building', buildingId: dude.id });
      await publishedEvent({ title: 'no location' });

      const northCampus = { west: -83.725, south: 42.285, east: -83.705, north: 42.3 };
      expect(await titles({ bbox: northCampus })).toEqual(['north via building']);
    });
  });

  describe('pagination', () => {
    it('walks all pages in (starts_at, id) order without gaps or duplicates', async () => {
      // Two events share a start time to exercise the id tie-breaker.
      for (const minutes of [10, 20, 20, 30, 40]) {
        await publishedEvent({ title: `t+${minutes}`, startsAt: later(minutes) });
      }

      const seen: string[] = [];
      let after: PublishedEventFilters['after'];
      let pages = 0;
      do {
        const page = await listPublishedEvents(db, { limit: 2, after });
        seen.push(...page.items.map((i) => i.event.id));
        after = page.nextCursor ?? undefined;
        pages += 1;
      } while (after);

      const all = (await listPublishedEvents(db, { limit: 100 })).items.map((i) => i.event.id);
      expect(pages).toBe(3);
      expect(seen).toEqual(all);
      expect(new Set(seen).size).toBe(5);
    });

    it('returns a null cursor when the page is not full', async () => {
      await publishedEvent();
      expect((await listPublishedEvents(db, { limit: 2 })).nextCursor).toBeNull();
    });
  });
});

describe('getPublishedEvent', () => {
  it('returns a published event by id regardless of time, and null otherwise', async () => {
    const past = await publishedEvent({ title: 'last week', startsAt: later(-7 * 24 * 60) });
    const { event: hidden } = await upsertEvent(db, eventInput({ title: 'no verdict' }), T0);

    expect((await getPublishedEvent(db, past.id))?.event.title).toBe('last week');
    expect(await getPublishedEvent(db, hidden.id)).toBeNull();
    expect(await getPublishedEvent(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('filters listPublishedEvents by ids', async () => {
    const a = await publishedEvent({ title: 'a' });
    await publishedEvent({ title: 'b' });
    expect(await titles({ ids: [a.id] })).toEqual(['a']);
  });
});

describe('pruneEndedEvents', () => {
  const insert = async (input: Parameters<typeof eventInput>[0]) =>
    (await upsertEvent(db, eventInput(input), T0)).event;

  it('deletes events that ended before the cutoff, by effective end, whatever their status', async () => {
    const ended = await insert({ startsAt: later(-180), endsAt: later(-120) });
    const endedRemoved = await insert({ startsAt: later(-180), endsAt: later(-90) });
    await db.update(events).set({ status: 'removed' }).where(eq(events.id, endedRemoved.id));
    // No end time: effective end is start + 1h, so this one ended at T0 - 61min.
    const noEndOld = await insert({ startsAt: later(-121), endsAt: null });
    // No end time, effective end T0 + 30min: still going at the cutoff.
    const noEndRecent = await insert({ startsAt: later(-30), endsAt: null });
    const endsAfter = await insert({ startsAt: later(-180), endsAt: later(10) });

    expect(await pruneEndedEvents(db, later(-60))).toBe(3);

    const left = await db.select({ id: events.id }).from(events);
    expect(left.map((e) => e.id).sort()).toEqual([noEndRecent.id, endsAfter.id].sort());
    expect(left.map((e) => e.id)).not.toContain(ended.id);
    expect(left.map((e) => e.id)).not.toContain(noEndOld.id);
  });

  it('cascades to classifications', async () => {
    const old = await insert({ startsAt: later(-300), endsAt: later(-240) });
    const kept = await insert({ startsAt: later(60), endsAt: later(120) });
    await insertClassification(db, old);
    await insertClassification(db, kept);

    await pruneEndedEvents(db, T0);

    const rows = await db.select({ eventId: classifications.eventId }).from(classifications);
    expect(rows).toEqual([{ eventId: kept.id }]);
  });

  it('deletes nothing when every event ends after the cutoff', async () => {
    await insert({ startsAt: later(0), endsAt: later(60) });
    expect(await pruneEndedEvents(db, T0)).toBe(0);
    expect(await db.$count(events)).toBe(1);
  });
});
