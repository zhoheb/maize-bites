import { z } from 'zod';
import type { DeviceClass } from './enums.js';

// Privacy-friendly page view counting. The web app sends one beacon per page view; the API
// turns it into a row keyed by a visitor id that only means anything within one day (see
// apps/api/src/analytics.ts). Nothing here identifies a person.

/** Viewport width buckets the beacon reports instead of an exact size. */
export const SCREEN_BUCKETS = ['small', 'medium', 'large'] as const;
export const screenBucketSchema = z.enum(SCREEN_BUCKETS);
export type ScreenBucket = z.infer<typeof screenBucketSchema>;

/** small < 640px, medium < 1024px, large otherwise (Tailwind's sm and lg breakpoints). */
export function screenBucketFor(width: number): ScreenBucket {
  return width < 640 ? 'small' : width < 1024 ? 'medium' : 'large';
}

/** Phones count as mobile; tablets and up as desktop. */
export function deviceFor(screen: ScreenBucket): DeviceClass {
  return screen === 'small' ? 'mobile' : 'desktop';
}

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*$/;

/** A referrer's host, lowercased and without "www.", or null if it isn't a plain hostname. */
export function referrerHost(value: string | null | undefined): string | null {
  const host = value
    ?.trim()
    .toLowerCase()
    .replace(/^www\./, '');
  return host && HOSTNAME.test(host) ? host : null;
}

/** POST /api/analytics/view. Sent with navigator.sendBeacon. */
export const pageViewRequestSchema = z.object({
  /** location.pathname + location.search; normalized on the server. */
  path: z.string().startsWith('/').max(2048),
  /** Host of document.referrer on the first page of a visit; null on in-app navigation. */
  referrer: z.string().max(253).nullable().optional(),
  screen: screenBucketSchema,
});
export type PageViewRequest = z.infer<typeof pageViewRequestSchema>;

/** The app's routes, as stored. Anything else is stored as NOT_FOUND_PATH. */
export const ANALYTICS_PATHS = [
  '/',
  '/events/:id',
  '/about',
  '/alerts',
  '/submit',
  '/admin',
  '/sign-in',
  '/auth/verify',
] as const;
export const NOT_FOUND_PATH = '/404';

/**
 * The route a URL belongs to, with query strings and ids dropped: `/events/abc?x=1` and
 * `/?event=abc` (the drawer on Home) are both `/events/:id`. Unknown paths collapse into
 * `/404`, so nothing a visitor typed into the address bar is stored.
 */
export function normalizePath(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw, 'https://maize-bites.invalid');
  } catch {
    return NOT_FOUND_PATH;
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' && url.searchParams.get('event')) return '/events/:id';
  if (/^\/events\/[^/]+$/.test(path)) return '/events/:id';
  return (ANALYTICS_PATHS as readonly string[]).includes(path) ? path : NOT_FOUND_PATH;
}

export const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/');

export const analyticsRangeSchema = z.enum(['30d', '90d']);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;
export const RANGE_DAYS: Record<AnalyticsRange, number> = { '30d': 30, '90d': 90 };

/** GET /api/admin/analytics query. */
export const adminAnalyticsQuerySchema = z.object({
  range: analyticsRangeSchema.default('30d'),
});

/** A number and the same number for the period just before it. */
const comparisonSchema = z.object({ value: z.number(), previous: z.number() });
export type Comparison = z.infer<typeof comparisonSchema>;

const dayStatsSchema = z.object({
  /** YYYY-MM-DD, America/Detroit. */
  day: z.string(),
  uniqueVisitors: z.number().int(),
  pageViews: z.number().int(),
  signedInVisitors: z.number().int(),
  /** Visitors who opened an event (its page or the drawer on Home). */
  eventVisitors: z.number().int(),
  /** People whose first alert subscription was made that day. Not linked to visitors. */
  alertSignups: z.number().int(),
});
export type DayStats = z.infer<typeof dayStatsSchema>;

const countSchema = z.object({ name: z.string(), views: z.number().int() });

/** GET /api/admin/analytics. */
export const adminAnalyticsResponseSchema = z.object({
  range: analyticsRangeSchema,
  /** Today in Ann Arbor, YYYY-MM-DD. */
  today: z.string(),
  tiles: z.object({
    today: comparisonSchema,
    yesterday: comparisonSchema,
    /** Mean daily unique visitors over the last 7 full days, vs the 7 before. */
    weekAverage: comparisonSchema,
    /**
     * Sum of daily unique visitors over the last 30 full days, vs the 30 before. Visitor ids
     * change every day by design, so this counts visitor-days, not distinct people.
     */
    last30: comparisonSchema,
  }),
  /** One entry per day of the range, oldest first, today last; days without data are zeros. */
  series: z.array(dayStatsSchema),
  topPages: z.array(countSchema),
  topReferrers: z.array(countSchema),
  /** Share of daily visitors on a phone over the range, 0 to 1; null without data. */
  mobileShare: z.number().min(0).max(1).nullable(),
  /** Whether the signed-in admin's own visits are left out. */
  excludeSelf: z.boolean(),
});
export type AdminAnalyticsResponse = z.infer<typeof adminAnalyticsResponseSchema>;

/** PUT /api/admin/analytics/settings. */
export const analyticsSettingsSchema = z.object({ excludeSelf: z.boolean() });
export type AnalyticsSettings = z.infer<typeof analyticsSettingsSchema>;
