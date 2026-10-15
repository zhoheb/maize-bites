import {
  classifications,
  getActiveClassification,
  upsertEvent,
  type Database,
  type DbHandle,
  type EventRow,
} from '@maize-bites/db';
import { createTestDb, eventInput, insertClassification } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backfillAudience } from './audience-backfill.js';

const NOW = new Date('2026-10-01T16:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
});
afterEach(async () => {
  await handle.close();
});

async function event(title: string, description: string | null, startsIn = 2): Promise<EventRow> {
  return (await upsertEvent(db, eventInput({ title, description, startsAt: hours(startsIn) }), NOW))
    .event;
}

/** Published events as the old classifier left them: an audience without evidence. */
async function seed() {
  const silent = await event('Pizza social', 'Free pizza and games');
  await insertClassification(db, silent, { audience: 'open', audienceEvidence: null });
  const members = await event('Chapter dinner', 'Free dinner for members only');
  await insertClassification(db, members, { audience: 'open', audienceEvidence: null });
  const rsvp = await event('Panel', 'Lunch provided. RSVP by Friday.');
  await insertClassification(db, rsvp, { audience: null, audienceEvidence: null });
  const open = await event('Lecture', 'Free and open to the public. Reception after.');
  await insertClassification(db, open, {
    method: 'rules',
    audience: 'open',
    audienceEvidence: null,
  });
  // A reviewer said this one is open, though the listing is silent: kept.
  const manual = await event('Bagels', 'Bagels on the Diag');
  await insertClassification(db, manual, { audience: 'members', audienceEvidence: null });
  await insertClassification(db, manual, {
    method: 'manual',
    model: null,
    audience: 'open',
    audienceEvidence: 'Asked the host',
    confidence: 1,
  });
  // Ended: left alone, and not counted.
  const past = await event('Old lunch', 'Members only', -5);
  await insertClassification(db, past, { audience: 'open', audienceEvidence: null });
  return { silent, members, rsvp, open, manual, past };
}

describe('backfillAudience', () => {
  it('rewrites machine verdicts from the listing and keeps manual ones', async () => {
    const e = await seed();

    const result = await backfillAudience({ db, now: NOW, logger });

    expect(result.before).toEqual({ open: 4, members: 0, rsvp: 0, unknown: 1 });
    expect(result.after).toEqual({ open: 2, members: 1, rsvp: 1, unknown: 1 });
    expect(result.changed).toBe(4);
    expect(result.keptManual).toBe(1);

    const active = async (ev: EventRow) => {
      const c = await getActiveClassification(db, ev.id);
      return { method: c?.method, audience: c?.audience, audienceEvidence: c?.audienceEvidence };
    };
    expect(await active(e.silent)).toEqual({
      method: 'llm',
      audience: 'unknown',
      audienceEvidence: null,
    });
    expect(await active(e.members)).toMatchObject({
      audience: 'members',
      audienceEvidence: 'Free dinner for members only',
    });
    expect(await active(e.rsvp)).toMatchObject({
      audience: 'rsvp',
      audienceEvidence: 'RSVP by Friday',
    });
    expect(await active(e.open)).toMatchObject({
      method: 'rules',
      audience: 'open',
      audienceEvidence: 'Free and open to the public',
    });
    expect(await active(e.manual)).toEqual({
      method: 'manual',
      audience: 'open',
      audienceEvidence: 'Asked the host',
    });
    // The ended event's row is untouched.
    expect(await active(e.past)).toMatchObject({ audience: 'open', audienceEvidence: null });

    expect(result.samples.members).toEqual([
      {
        title: 'Chapter dinner',
        evidence: 'Free dinner for members only',
        url: null,
      },
    ]);
    expect(result.samples.unknown.map((s) => s.title)).toEqual(['Pizza social']);
  });

  it('is idempotent', async () => {
    await seed();
    await backfillAudience({ db, now: NOW, logger });
    const again = await backfillAudience({ db, now: NOW, logger });
    expect(again.changed).toBe(0);
    expect(again.before).toEqual(again.after);
  });

  it('writes nothing in a dry run, but reports what it would do', async () => {
    await seed();
    const snapshot = await db.select().from(classifications);

    const result = await backfillAudience({ db, now: NOW, logger, dryRun: true });

    expect(result.changed).toBe(4);
    expect(result.after).toEqual({ open: 2, members: 1, rsvp: 1, unknown: 1 });
    expect(await db.select().from(classifications)).toEqual(snapshot);
  });
});
