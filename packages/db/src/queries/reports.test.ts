import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../client.js';
import { reports, users } from '../schema.js';
import { createTestDb, eventInput } from '../testing.js';
import { upsertEvent } from './events.js';
import { countReportsByKind } from './reports.js';

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
