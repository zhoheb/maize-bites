import {
  isAdminPath,
  normalizePath,
  referrerHost,
  screenBucketFor,
  type Comparison,
  type PageViewRequest,
} from '@maize-bites/shared';

// Page view beacons. No cookie, no stored id: the API derives a visitor id that changes every
// day from the request itself (see apps/api/src/analytics.ts). Nothing is sent when the browser
// asks not to be tracked.

export const PAGE_VIEW_URL = '/api/analytics/view';

type PrivacySignals = Pick<Navigator, 'doNotTrack'> & { globalPrivacyControl?: boolean };

/** Do Not Track or Global Privacy Control is on. */
export function prefersNoTracking(nav: PrivacySignals): boolean {
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.doNotTrack === 'yes';
}

/**
 * What counts as a new page: the path, plus the event open in Home's drawer. Changing a filter
 * or tab on the same page doesn't.
 */
export function pageKey(pathname: string, search: string): string {
  return `${pathname}|${new URLSearchParams(search).get('event') ?? ''}`;
}

/** The referring site's host if it's another site, else null. */
export function externalReferrer(referrer: string, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname;
    return host === ownHost ? null : referrerHost(host);
  } catch {
    return null;
  }
}

export function pageViewFor(
  location: { pathname: string; search: string },
  referrer: string | null,
  width: number,
): PageViewRequest | null {
  const raw = `${location.pathname}${location.search}`;
  if (isAdminPath(normalizePath(raw))) return null;
  return { path: raw, referrer, screen: screenBucketFor(width) };
}

type Beacon = Pick<Navigator, 'sendBeacon'>;

/** Fire and forget: sendBeacon where it exists, else a keepalive fetch. Never throws. */
export function sendPageView(view: PageViewRequest, nav: Partial<Beacon> = navigator): void {
  const body = JSON.stringify(view);
  try {
    if (nav.sendBeacon?.(PAGE_VIEW_URL, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    // Some browsers throw on a blocked beacon; fall through to fetch.
  }
  void fetch(PAGE_VIEW_URL, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Dashboard formatting
// ---------------------------------------------------------------------------

const PATH_LABELS: Record<string, string> = {
  '/': 'Home',
  '/events/:id': 'Event pages',
  '/about': 'About',
  '/alerts': 'Alerts',
  '/submit': 'Share',
  '/sign-in': 'Sign in',
  '/auth/verify': 'Sign-in link',
  '/404': 'Not found',
};

export const pathLabel = (path: string) => PATH_LABELS[path] ?? path;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US');

/** 1,284 below ten thousand, then 12.9K. Fractions to one place. */
export function formatCount(value: number): string {
  if (!Number.isInteger(value)) return value.toFixed(1);
  return value < 10_000 ? whole.format(value) : compact.format(value);
}

export function formatShare(share: number): string {
  return `${String(Math.round(share * 100))}%`;
}

export interface Change {
  direction: 'up' | 'down' | 'flat';
  /** "+12%", "−8%", "no change", or "new" when there was nothing before. */
  text: string;
}

export function describeChange({ value, previous }: Comparison): Change {
  if (previous === 0)
    return value === 0
      ? { direction: 'flat', text: 'no change' }
      : { direction: 'up', text: 'new' };
  const pct = Math.round(((value - previous) / previous) * 100);
  if (pct === 0) return { direction: 'flat', text: 'no change' };
  return pct > 0
    ? { direction: 'up', text: `+${String(pct)}%` }
    : { direction: 'down', text: `−${String(-pct)}%` };
}

/** A round axis maximum at or above `max`: 1, 2 or 5 times a power of ten. */
export function niceMax(max: number): number {
  if (max <= 0) return 4;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= max) return Math.max(step * power, 4);
  }
  return 10 * power;
}

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Oct 14" for a YYYY-MM-DD day. */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}
