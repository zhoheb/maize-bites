import { createHash, randomBytes } from 'node:crypto';
import type { DayAggregate } from '@maize-bites/db';
import {
  RANGE_DAYS,
  addDays,
  isAdminPath,
  type AdminAnalyticsResponse,
  type AnalyticsRange,
  type Comparison,
} from '@maize-bites/shared';

// Privacy-friendly visitor counting.
//
// visitor_id = sha256(daily salt + client IP + User-Agent + site host). The salt is random, one
// per America/Detroit day, kept only in analytics_salts and deleted two days later. The IP and
// User-Agent are used for the hash and dropped; they are never stored or logged. Once a day's
// salt is gone, nobody (us included) can recompute that day's ids or link them to another day,
// so "unique visitors" only means anything within a single day.

/** Crawlers, link unfurlers, monitors, headless browsers and HTTP libraries. */
export const BOT_USER_AGENT =
  /bot\b|bot\/|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|whatsapp|bingpreview|yandex|baidu|semrush|ahrefs|petalbot|bytespider|gptbot|headlesschrome|phantomjs|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|python-requests|python-urllib|aiohttp|curl\/|wget|httpclient|go-http-client|node-fetch|undici|axios|okhttp|java\/|libwww|scrapy/i;

export type SkipReason =
  'no_user_agent' | 'bot' | 'prefetch' | 'do_not_track' | 'admin_path' | 'self';

export interface ViewSignals {
  userAgent: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  /** Normalized path. */
  path: string;
  /** The visitor is an admin who left "exclude my visits" on. */
  excludedAdmin: boolean;
}

const header = (headers: ViewSignals['headers'], name: string) => {
  const value = headers[name];
  return (Array.isArray(value) ? value.join(',') : (value ?? '')).toLowerCase();
};

/** Why a page view isn't counted, or null to count it. */
export function skipReason({
  userAgent,
  headers,
  path,
  excludedAdmin,
}: ViewSignals): SkipReason | null {
  if (!userAgent?.trim()) return 'no_user_agent';
  if (BOT_USER_AGENT.test(userAgent)) return 'bot';
  if (
    /prefetch|prerender|preview/.test(header(headers, 'sec-purpose')) ||
    /prefetch|preview/.test(header(headers, 'purpose')) ||
    header(headers, 'x-moz').includes('prefetch') ||
    header(headers, 'x-purpose').includes('preview')
  )
    return 'prefetch';
  if (header(headers, 'dnt') === '1' || header(headers, 'sec-gpc') === '1') return 'do_not_track';
  if (isAdminPath(path)) return 'admin_path';
  if (excludedAdmin) return 'self';
  return null;
}

export function visitorId(salt: string, ip: string, userAgent: string, siteHost: string): string {
  return createHash('sha256').update(`${salt}\n${ip}\n${userAgent}\n${siteHost}`).digest('hex');
}

export const newSalt = () => randomBytes(32).toString('base64url');

/** How far back the dashboard reads: the range, or 61 days for the 30-day comparison tile. */
export function analyticsWindow(
  range: AnalyticsRange,
  today: string,
): { from: string; to: string } {
  return { from: addDays(today, -Math.max(RANGE_DAYS[range] - 1, 60)), to: today };
}

const TOP = 10;

function mergeCounts(lists: { name: string; views: number }[][]) {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const { name, views } of list) totals.set(name, (totals.get(name) ?? 0) + views);
  }
  return [...totals]
    .map(([name, views]) => ({ name, views }))
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name))
    .slice(0, TOP);
}

/** The admin dashboard from per-day figures. Pure; `days` may cover more than the range. */
export function buildAnalyticsResponse(input: {
  range: AnalyticsRange;
  today: string;
  days: DayAggregate[];
  signups: Map<string, number>;
  excludeSelf: boolean;
}): AdminAnalyticsResponse {
  const { range, today, signups, excludeSelf } = input;
  const byDay = new Map(input.days.map((d) => [d.day, d]));
  const visitors = (day: string) => byDay.get(day)?.uniqueVisitors ?? 0;
  /** Sum of daily uniques over `length` days ending `endOffset` days before today. */
  const sum = (endOffset: number, length: number) => {
    let total = 0;
    for (let i = 0; i < length; i++) total += visitors(addDays(today, -(endOffset + i)));
    return total;
  };
  const compare = (value: number, previous: number): Comparison => ({ value, previous });

  const rangeDays = Array.from({ length: RANGE_DAYS[range] }, (_, i) =>
    addDays(today, i - RANGE_DAYS[range] + 1),
  );
  const inRange = rangeDays.flatMap((day) => byDay.get(day) ?? []);
  const totalVisitors = inRange.reduce((n, d) => n + d.uniqueVisitors, 0);

  return {
    range,
    today,
    tiles: {
      today: compare(visitors(today), visitors(addDays(today, -1))),
      yesterday: compare(visitors(addDays(today, -1)), visitors(addDays(today, -2))),
      weekAverage: compare(sum(1, 7) / 7, sum(8, 7) / 7),
      last30: compare(sum(1, 30), sum(31, 30)),
    },
    series: rangeDays.map((day) => {
      const d = byDay.get(day);
      return {
        day,
        uniqueVisitors: d?.uniqueVisitors ?? 0,
        pageViews: d?.pageViews ?? 0,
        signedInVisitors: d?.signedInVisitors ?? 0,
        eventVisitors: d?.eventVisitors ?? 0,
        alertSignups: signups.get(day) ?? 0,
      };
    }),
    topPages: mergeCounts(inRange.map((d) => d.topPaths)),
    topReferrers: mergeCounts(inRange.map((d) => d.topReferrers)),
    mobileShare:
      totalVisitors === 0
        ? null
        : inRange.reduce((n, d) => n + d.mobileShare * d.uniqueVisitors, 0) / totalVisitors,
    excludeSelf,
  };
}
