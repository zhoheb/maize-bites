import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../client.js';
import { analyticsDaily, analyticsSalts, pageViews, subscriptions, users } from '../schema.js';
import { createTestDb } from '../testing.js';
import {
  alertSignupsByDay,
  analyticsDays,
  deleteExpiredSalts,
  deleteOldPageViews,
  recordPageView,
  rollUpPageViews,
  saltForDay,
  type PageViewInput,
} from './analytics.js';

let handle: DbHandle;
beforeEach(async () => {
  handle = await createTestDb();
});
afterEach(async () => {
  await handle.close();
});

const view = (overrides: Partial<PageViewInput> = {}): PageViewInput => ({
  day: '2026-10-14',
  visitorId: 'v1',
  path: '/',
  referrerHost: null,
  device: 'desktop',
  isSignedIn: false,
  at: new Date('2026-10-14T16:00:00Z'),
  ...overrides,
});

describe('saltForDay', () => {
  it('creates one salt per day, keeps it, and deletes salts from before yesterday', async () => {
    const { db } = handle;
    let n = 0;
    const newSalt = () => `salt-${String(++n)}`;
    expect(await saltForDay(db, '2026-10-12', newSalt)).toBe('salt-1');
    expect(await saltForDay(db, '2026-10-12', newSalt)).toBe('salt-1');
    expect(await saltForDay(db, '2026-10-13', newSalt)).toBe('salt-3');
    expect(await saltForDay(db, '2026-10-14', newSalt)).toBe('salt-4');
    const days = (await db.select().from(analyticsSalts)).map((r) => r.day).sort();
    expect(days).toEqual(['2026-10-13', '2026-10-14']);
  });

  it('deleteExpiredSalts keeps only today and yesterday', async () => {
    const { db } = handle;
    await db
      .insert(analyticsSalts)
      .values(
        ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'].map((day) => ({ day, salt: day })),
      );
    expect(await deleteExpiredSalts(db, '2026-10-14')).toBe(2);
    expect((await db.select().from(analyticsSalts)).map((r) => r.day).sort()).toEqual([
      '2026-10-13',
      '2026-10-14',
    ]);
  });
});

describe('rollup and retention', () => {
  async function seed() {
    const { db } = handle;
    for (const v of [
      view({ day: '2026-10-13', visitorId: 'a', device: 'mobile', referrerHost: 'reddit.com' }),
      view({ day: '2026-10-13', visitorId: 'a', path: '/events/:id', device: 'mobile' }),
      view({ day: '2026-10-13', visitorId: 'b', isSignedIn: true, referrerHost: 'reddit.com' }),
      view({ day: '2026-10-13', visitorId: 'c', path: '/about', referrerHost: 'instagram.com' }),
      view({ day: '2026-10-14', visitorId: 'd' }),
    ]) {
      await recordPageView(db, v);
    }
  }

  it('rolls up finished days once and leaves today live', async () => {
    const { db } = handle;
    await seed();
    expect(await rollUpPageViews(db, '2026-10-14')).toEqual(['2026-10-13']);
    expect(await rollUpPageViews(db, '2026-10-14')).toEqual([]);

    const [daily] = await db.select().from(analyticsDaily);
    expect(daily).toMatchObject({
      day: '2026-10-13',
      uniqueVisitors: 3,
      pageViews: 4,
      signedInVisitors: 1,
      eventVisitors: 1,
      topPaths: [
        { name: '/', views: 2 },
        { name: '/about', views: 1 },
        { name: '/events/:id', views: 1 },
      ],
      topReferrers: [
        { name: 'reddit.com', views: 2 },
        { name: 'instagram.com', views: 1 },
      ],
    });
    expect(daily?.mobileShare).toBeCloseTo(1 / 3);

    const days = await analyticsDays(db, '2026-10-01', '2026-10-14');
    expect(days.map((d) => [d.day, d.uniqueVisitors])).toEqual([
      ['2026-10-13', 3],
      ['2026-10-14', 1],
    ]);
  });

  it('deletes raw views older than 90 days but keeps their daily totals', async () => {
    const { db } = handle;
    await recordPageView(db, view({ day: '2026-07-15' }));
    await recordPageView(db, view({ day: '2026-07-16' }));
    await rollUpPageViews(db, '2026-10-14');
    expect(await deleteOldPageViews(db, '2026-10-14')).toBe(1);
    expect((await db.select().from(pageViews)).map((r) => r.day)).toEqual(['2026-07-16']);
    const days = await analyticsDays(db, '2026-07-01', '2026-10-14');
    expect(days.map((d) => d.day)).toEqual(['2026-07-15', '2026-07-16']);
  });
});

describe('alertSignupsByDay', () => {
  it('counts each person once, on the day of their first subscription', async () => {
    const { db } = handle;
    const [a, b] = await db
      .insert(users)
      .values([{ email: 'a@umich.edu' }, { email: 'b@umich.edu' }])
      .returning();
    if (!a || !b) throw new Error('seed users missing');
    await db.insert(subscriptions).values([
      // 11:30 PM in Ann Arbor on the 13th, already the 14th in UTC.
      { userId: a.id, channel: 'email', createdAt: new Date('2026-10-14T03:30:00Z') },
      { userId: a.id, channel: 'push', createdAt: new Date('2026-10-14T15:00:00Z') },
      { userId: b.id, channel: 'email', createdAt: new Date('2026-10-14T15:00:00Z') },
    ]);
    expect(Object.fromEntries(await alertSignupsByDay(db, '2026-10-01', '2026-10-31'))).toEqual({
      '2026-10-13': 1,
      '2026-10-14': 1,
    });
  });
});
