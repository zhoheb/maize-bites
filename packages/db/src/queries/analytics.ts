import { addDays, CAMPUS_TIME_ZONE, type DeviceClass } from '@maize-bites/shared';
import { and, asc, count, desc, eq, gte, isNotNull, lt, lte, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  analyticsDaily,
  analyticsSalts,
  pageViews,
  subscriptions,
  users,
  type NamedCount,
} from '../schema.js';

// Page view analytics. Days are America/Detroit calendar days as YYYY-MM-DD strings; callers
// compute them (localDateOf) so a request near midnight is filed under one day consistently.

/** Raw page_views rows are deleted after this many days; analytics_daily keeps the totals. */
export const PAGE_VIEW_RETENTION_DAYS = 90;
/** How many paths and referrers a day's rollup keeps. */
export const TOP_N = 10;

/**
 * The salt for `day`, created with `newSalt` if there isn't one yet. Salts for days before
 * yesterday are deleted on the way, so old visitor ids can never be recomputed even if the
 * housekeeping job doesn't run.
 */
export async function saltForDay(
  db: Database,
  day: string,
  newSalt: () => string,
): Promise<string> {
  await db.delete(analyticsSalts).where(lt(analyticsSalts.day, addDays(day, -1)));
  await db.insert(analyticsSalts).values({ day, salt: newSalt() }).onConflictDoNothing();
  const [row] = await db
    .select({ salt: analyticsSalts.salt })
    .from(analyticsSalts)
    .where(eq(analyticsSalts.day, day));
  if (!row) throw new Error(`No analytics salt for ${day}`);
  return row.salt;
}

/** Deletes salts for days before yesterday. Returns how many. */
export async function deleteExpiredSalts(db: Database, today: string): Promise<number> {
  const rows = await db
    .delete(analyticsSalts)
    .where(lt(analyticsSalts.day, addDays(today, -1)))
    .returning({ day: analyticsSalts.day });
  return rows.length;
}

export interface PageViewInput {
  day: string;
  visitorId: string;
  path: string;
  referrerHost: string | null;
  device: DeviceClass;
  isSignedIn: boolean;
  at: Date;
}

export async function recordPageView(db: Database, view: PageViewInput): Promise<void> {
  const { at, ...rest } = view;
  await db.insert(pageViews).values({ ...rest, createdAt: at });
}

/** Whether a user's own visits are left out of the analytics. Unknown users: false. */
export async function isExcludedFromAnalytics(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ exclude: users.excludeFromAnalytics })
    .from(users)
    .where(eq(users.id, userId));
  return row?.exclude ?? false;
}

export async function setExcludeFromAnalytics(
  db: Database,
  userId: string,
  exclude: boolean,
): Promise<void> {
  await db.update(users).set({ excludeFromAnalytics: exclude }).where(eq(users.id, userId));
}

export interface DayAggregate {
  day: string;
  uniqueVisitors: number;
  pageViews: number;
  signedInVisitors: number;
  eventVisitors: number;
  mobileShare: number;
  topPaths: NamedCount[];
  topReferrers: NamedCount[];
}

/** Per-day totals computed from raw page_views for days in [from, to]. */
async function aggregatePageViews(db: Database, from: string, to: string): Promise<DayAggregate[]> {
  const inRange = and(gte(pageViews.day, from), lte(pageViews.day, to));
  const visitors = sql<number>`count(distinct ${pageViews.visitorId})::int`;
  const [totals, paths, referrers] = await Promise.all([
    db
      .select({
        day: pageViews.day,
        uniqueVisitors: visitors,
        pageViews: sql<number>`count(*)::int`,
        signedInVisitors: sql<number>`(count(distinct ${pageViews.visitorId}) filter (where ${pageViews.isSignedIn}))::int`,
        eventVisitors: sql<number>`(count(distinct ${pageViews.visitorId}) filter (where ${pageViews.path} = '/events/:id'))::int`,
        mobileVisitors: sql<number>`(count(distinct ${pageViews.visitorId}) filter (where ${pageViews.device} = 'mobile'))::int`,
      })
      .from(pageViews)
      .where(inRange)
      .groupBy(pageViews.day)
      .orderBy(asc(pageViews.day)),
    db
      .select({ day: pageViews.day, name: pageViews.path, views: count() })
      .from(pageViews)
      .where(inRange)
      .groupBy(pageViews.day, pageViews.path)
      .orderBy(desc(count()), asc(pageViews.path)),
    db
      .select({ day: pageViews.day, name: sql<string>`${pageViews.referrerHost}`, views: count() })
      .from(pageViews)
      .where(and(inRange, isNotNull(pageViews.referrerHost)))
      .groupBy(pageViews.day, pageViews.referrerHost)
      .orderBy(desc(count()), asc(pageViews.referrerHost)),
  ]);
  const topFor = (rows: { day: string; name: string; views: number }[], day: string) =>
    rows
      .filter((r) => r.day === day)
      .slice(0, TOP_N)
      .map(({ name, views }) => ({ name, views }));
  return totals.map(({ mobileVisitors, ...t }) => ({
    ...t,
    mobileShare: t.uniqueVisitors === 0 ? 0 : mobileVisitors / t.uniqueVisitors,
    topPaths: topFor(paths, t.day),
    topReferrers: topFor(referrers, t.day),
  }));
}

/**
 * Rolls every finished day (before `today`) that has raw page views and no analytics_daily
 * row into analytics_daily. A finished day's raw rows never change, so a day is rolled up once.
 * Returns the days written.
 */
export async function rollUpPageViews(db: Database, today: string): Promise<string[]> {
  const done = db.select({ day: analyticsDaily.day }).from(analyticsDaily);
  const pending = await db
    .selectDistinct({ day: pageViews.day })
    .from(pageViews)
    .where(and(lt(pageViews.day, today), notInArray(pageViews.day, done)))
    .orderBy(asc(pageViews.day));
  const first = pending[0]?.day;
  const last = pending.at(-1)?.day;
  if (!first || !last) return [];
  const wanted = new Set(pending.map((p) => p.day));
  const rows = (await aggregatePageViews(db, first, last)).filter((r) => wanted.has(r.day));
  if (rows.length > 0) await db.insert(analyticsDaily).values(rows).onConflictDoNothing();
  return rows.map((r) => r.day);
}

/** Deletes raw page views older than PAGE_VIEW_RETENTION_DAYS. Returns how many. */
export async function deleteOldPageViews(db: Database, today: string): Promise<number> {
  const rows = await db
    .delete(pageViews)
    .where(lt(pageViews.day, addDays(today, -PAGE_VIEW_RETENTION_DAYS)))
    .returning({ id: pageViews.id });
  return rows.length;
}

/** How many raw page view rows are stored, for logs. */
export async function countPageViews(db: Database): Promise<number> {
  return db.$count(pageViews);
}

/**
 * Per-day figures for [from, to], oldest first, only for days with data: analytics_daily where
 * a day is rolled up, raw page_views otherwise (today, and days the job hasn't reached yet).
 */
export async function analyticsDays(
  db: Database,
  from: string,
  to: string,
): Promise<DayAggregate[]> {
  const rolled = await db
    .select()
    .from(analyticsDaily)
    .where(and(gte(analyticsDaily.day, from), lte(analyticsDaily.day, to)));
  const rolledDays = new Set(rolled.map((r) => r.day));
  const live = (await aggregatePageViews(db, from, to)).filter((r) => !rolledDays.has(r.day));
  return [...rolled.map(({ updatedAt: _updatedAt, ...r }) => r), ...live].sort((a, b) =>
    a.day.localeCompare(b.day),
  );
}

/** People whose first alert subscription was made on each day in [from, to]. */
export async function alertSignupsByDay(
  db: Database,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const firsts = db
    .select({
      day: sql<string>`(min(${subscriptions.createdAt}) at time zone ${CAMPUS_TIME_ZONE})::date::text`.as(
        'day',
      ),
    })
    .from(subscriptions)
    .groupBy(subscriptions.userId)
    .as('firsts');
  const rows = await db
    .select({ day: firsts.day, signups: sql<number>`count(*)::int` })
    .from(firsts)
    .where(and(gte(firsts.day, from), lte(firsts.day, to)))
    .groupBy(firsts.day);
  return new Map(rows.map((r) => [r.day, r.signups]));
}
