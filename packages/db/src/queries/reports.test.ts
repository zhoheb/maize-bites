import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../client.js';
import { reports, users } from '../schema.js';
import { createTestDb, eventInput } from '../testing.js';
import { upsertEvent } from './events.js';
import { countReportsByKind, lastReportAt } from './reports.js';

let handle: DbHandle;
beforeEach(async () => {
  handle = await createTestDb();
});
afterEach(async () => {
  await handle.close();
});

describe('countReportsByKind', () => {
  it('counts reports per kind for one event, with zeros for missing kinds', async () => {
    const { db } = handle;
    const { event } = await upsertEvent(db, eventInput());
    const { event: other } = await upsertEvent(db, eventInput());
    const [a, b, c] = await db
      .insert(users)
      .values(['a', 'b', 'c'].map((n) => ({ email: `${n}@umich.edu` })))
      .returning();
    if (!a || !b || !c) throw new Error('seed users missing');
    await db
      .insert(reports)
      .values([
        ...[a, b, c].map((u) => ({ eventId: event.id, userId: u.id, kind: 'food_gone' as const })),
        { eventId: event.id, userId: a.id, kind: 'still_food' },
        { eventId: other.id, userId: a.id, kind: 'not_free' },
      ]);

    expect(await countReportsByKind(db, event.id)).toEqual({
      food_gone: 3,
      still_food: 1,
      not_free: 0,
      wrong_info: 0,
    });
  });
});

describe('lastReportAt', () => {
  it('is the newest report of any kind on the event, and null with none', async () => {
    const { db } = handle;
    const { event } = await upsertEvent(db, eventInput());
    const { event: quiet } = await upsertEvent(db, eventInput());
    const [a, b] = await db
      .insert(users)
      .values(['a', 'b'].map((n) => ({ email: `${n}@umich.edu` })))
      .returning();
    if (!a || !b) throw new Error('seed users missing');
    const older = new Date('2026-10-01T15:00:00Z');
    const newer = new Date('2026-10-01T15:40:00Z');
    await db.insert(reports).values([
      { eventId: event.id, userId: a.id, kind: 'food_gone', createdAt: older },
      { eventId: event.id, userId: b.id, kind: 'still_food', createdAt: newer },
    ]);

    expect(await lastReportAt(db, event.id)).toEqual(newer);
    expect(await lastReportAt(db, quiet.id)).toBeNull();
  });
});
