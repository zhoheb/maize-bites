import {
  FeedHttpError,
  buildUserAgent,
  defaultSleep,
  httpGet,
  type HttpOptions,
} from '../http/client.js';
import { happeningPageSchema } from './schema.js';
import { localDate, parseFeedDateTime } from './time.js';

const HAPPENING_LIST_URL = 'https://events.umich.edu/list/json';
const FEED_TIME_ZONE = 'America/Detroit';

export { FeedHttpError, buildUserAgent, type HttpOptions };

/** GET a JSON URL through the shared feed client. */
export async function getJson(url: URL, options: HttpOptions): Promise<unknown> {
  const result = await httpGet<unknown>(url, options, {
    accept: 'application/json',
    parse: (res) => res.json(),
  });
  // No validators are sent, so a 304 can't come back.
  if (result.status !== 'ok')
    throw new FeedHttpError(`GET ${url.pathname} → unexpected 304`, false);
  return result.body;
}

/** Calendar arithmetic on a `YYYY-MM-DD` string. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface FeedWindow {
  items: unknown[];
  /** False if paging stopped early (hit maxPages); callers must not infer removals then. */
  complete: boolean;
  pages: number;
  windowStart: Date;
  windowEnd: Date;
}

export interface WindowOptions {
  from: Date;
  /** Local calendar days to fetch, starting with `from`'s day. Default 14. */
  days?: number;
  /** Feed maximum is 200. */
  pageSize?: number;
  /** Safety cap. Default 25 pages (5,000 occurrences). */
  maxPages?: number;
  /** Pause between page requests. Default 1s. */
  pageDelayMs?: number;
}

/**
 * Fetches every occurrence in a date window, page by page, until a short page.
 * Items are deduplicated by feed id in case the listing shifts between pages.
 */
export async function fetchHappeningWindow(
  http: HttpOptions,
  options: WindowOptions,
): Promise<FeedWindow> {
  const { from, days = 14, pageSize = 200, maxPages = 25, pageDelayMs = 1_000 } = options;
  const sleep = http.sleep ?? defaultSleep;
  const firstDay = localDate(from, FEED_TIME_ZONE);
  const lastDay = addDays(firstDay, days - 1);
  const range = `${firstDay}to${lastDay}`;
  // Local midnight after the last day: events starting before this were in scope.
  const windowEnd = parseFeedDateTime(
    `${addDays(firstDay, days).replaceAll('-', '')}T000000`,
    FEED_TIME_ZONE,
  );

  const items: unknown[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(pageDelayMs);

    const url = new URL(HAPPENING_LIST_URL);
    url.search = new URLSearchParams({
      v: '2',
      range,
      'max-results': String(pageSize),
      page: String(page),
    }).toString();

    const parsed = happeningPageSchema.safeParse(await getJson(url, http));
    if (!parsed.success) throw new FeedHttpError(`Page ${page} is not a JSON array`, false);

    for (const item of parsed.data) {
      const id = typeof item === 'object' && item !== null && 'id' in item ? String(item.id) : null;
      if (id !== null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      items.push(item);
    }

    if (parsed.data.length < pageSize) {
      return { items, complete: true, pages: page, windowStart: from, windowEnd };
    }
  }
  return { items, complete: false, pages: maxPages, windowStart: from, windowEnd };
}
