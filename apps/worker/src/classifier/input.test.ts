import { upsertEvent, type Database, type DbHandle } from '@maize-bites/db';
import { createTestDb, eventInput } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifierInputFromEvent } from './input.js';

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
});
afterEach(async () => {
  await handle.close();
});

async function inputFor(raw: unknown) {
  const { event } = await upsertEvent(db, eventInput({ raw }));
  return classifierInputFromEvent(event);
}

describe('classifierInputFromEvent', () => {
  it('copies the fields the classifier reads from the event row', async () => {
    const startsAt = new Date('2026-10-01T16:00:00Z');
    const endsAt = new Date('2026-10-01T17:00:00Z');
    const { event } = await upsertEvent(
      db,
      eventInput({
        title: 'Lunch & Learn',
        description: 'Pizza provided.',
        locationName: 'Michigan Union',
        room: '2105A',
        startsAt,
        endsAt,
        tags: ['Food'],
        sponsor: 'Ginsberg Center',
      }),
    );
    expect(classifierInputFromEvent(event)).toEqual({
      title: 'Lunch & Learn',
      description: 'Pizza provided.',
      locationName: 'Michigan Union',
      room: '2105A',
      startsAt,
      endsAt,
      tags: ['Food'],
      sponsor: 'Ginsberg Center',
      cost: null,
    });
  });

  it("reads the feed's cost field from raw, trimmed", async () => {
    expect((await inputFor({ cost: '  Free - no tickets required ' })).cost).toBe(
      'Free - no tickets required',
    );
  });

  it('treats a missing, blank, or non-string cost as no cost', async () => {
    for (const raw of [null, {}, { cost: '' }, { cost: '   ' }, { cost: null }, { cost: 16 }]) {
      expect((await inputFor(raw)).cost).toBeNull();
    }
  });
});
