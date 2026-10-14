import {
  analyticsDaily,
  analyticsSalts,
  classifications,
  consumeMagicLink,
  createMagicLink,
  createSession,
  events,
  magicLinkTokens,
  pageViews,
  recordPageView,
  sessions,
  upsertEvent,
  upsertUserByEmail,
  type Database,
  type DbHandle,
} from '@maize-bites/db';
import { createTestDb, eventInput, insertClassification } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsRollupJob, authCleanupJob, pruneEventsJob } from './housekeeping.js';

const NOW = new Date('2026-10-01T16:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let handle: DbHandle;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  logger.info.mockReset();
});
afterEach(async () => {
  await handle.close();
});

describe('authCleanupJob', () => {
  it('runs daily and deletes only expired sessions and used or expired links', async () => {
    const user = await upsertUserByEmail(db, 'wolverine@umich.edu');
    await createSession(db, { userId: user.id, tokenHash: 'expired', expiresAt: ago(1) });
    await createSession(db, { userId: user.id, tokenHash: 'live', expiresAt: ago(-DAY) });
    const email = user.email;
    await createMagicLink(db, { email, tokenHash: 'link-expired', expiresAt: ago(1) });
    await createMagicLink(db, { email, tokenHash: 'link-used', expiresAt: ago(-60_000) });
    await consumeMagicLink(db, 'link-used', ago(5_000));
    await createMagicLink(db, { email, tokenHash: 'link-fresh', expiresAt: ago(-60_000) });

    const job = authCleanupJob(db, logger, () => NOW);
    expect(job.schedule).toBe('17 4 * * *');
    expect(await job.run()).toBe(3);

    const s = await db.select({ tokenHash: sessions.tokenHash }).from(sessions);
    expect(s).toEqual([{ tokenHash: 'live' }]);
    const t = await db.select({ tokenHash: magicLinkTokens.tokenHash }).from(magicLinkTokens);
    expect(t).toEqual([{ tokenHash: 'link-fresh' }]);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('deleted 3'));
  });
});

describe('pruneEventsJob', () => {
  const insert = async (startsAt: Date, endsAt: Date | null) =>
    (await upsertEvent(db, eventInput({ startsAt, endsAt }), NOW)).event;

  it('deletes events that ended more than retentionDays ago, with their classifications', async () => {
    const old = await insert(ago(31 * DAY), ago(31 * DAY - 3_600_000));
    const recent = await insert(ago(29 * DAY), ago(29 * DAY - 3_600_000));
    const upcoming = await insert(ago(-DAY), null);
    await insertClassification(db, old);
    await insertClassification(db, recent);

    const job = pruneEventsJob(db, logger, { retentionDays: 30, intervalMinutes: 60 }, () => NOW);
    expect(await job.run()).toBe(1);

    const left = await db.select({ id: events.id }).from(events);
    expect(left.map((e) => e.id).sort()).toEqual([recent.id, upcoming.id].sort());
    const cls = await db.select({ eventId: classifications.eventId }).from(classifications);
    expect(cls).toEqual([{ eventId: recent.id }]);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('ended before 2026-09-01T16:00:00.000Z'),
    );
  });

  it('schedules from PRUNE_INTERVAL_MINUTES', () => {
    const job = (intervalMinutes: number) =>
      pruneEventsJob(db, logger, { retentionDays: 30, intervalMinutes });
    expect(job(60).schedule).toBe('0 * * * *');
    expect(job(15).schedule).toBe('*/15 * * * *');
    expect(job(360).schedule).toBe('0 */6 * * *');
    expect(() => job(45)).toThrow(/Unsupported interval/);
  });
});

describe('analyticsRollupJob', () => {
  it('keeps daily totals, then deletes raw views past 90 days and old salts', async () => {
    const view = (day: string, visitorId: string) =>
      recordPageView(db, {
        day,
        visitorId,
        path: '/',
        referrerHost: null,
        device: 'desktop',
        isSignedIn: false,
        at: NOW,
      });
    await view('2026-06-01', 'old'); // past 90 days, never rolled up before
    await view('2026-09-30', 'a');
    await view('2026-09-30', 'b');
    await view('2026-10-01', 'c'); // today: stays raw
    await db.insert(analyticsSalts).values([
      { day: '2026-09-29', salt: 'x' },
      { day: '2026-09-30', salt: 'y' },
      { day: '2026-10-01', salt: 'z' },
    ]);

    const job = analyticsRollupJob(db, logger, () => NOW);
    expect(job.schedule).toBe('37 4 * * *');
    expect(await job.run()).toBe(2);

    const daily = await db.select().from(analyticsDaily);
    expect(daily.map((d) => [d.day, d.uniqueVisitors]).sort()).toEqual([
      ['2026-06-01', 1],
      ['2026-09-30', 2],
    ]);
    expect((await db.select().from(pageViews)).map((r) => r.day).sort()).toEqual([
      '2026-09-30',
      '2026-09-30',
      '2026-10-01',
    ]);
    expect((await db.select().from(analyticsSalts)).map((r) => r.day).sort()).toEqual([
      '2026-09-30',
      '2026-10-01',
    ]);
    expect(await job.run()).toBe(0);
  });
});
