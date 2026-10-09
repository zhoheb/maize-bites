import { happeningPageSchema } from './schema.js';
import { localDate, parseFeedDateTime } from './time.js';

export const HAPPENING_LIST_URL = 'https://events.umich.edu/list/json';
const FEED_TIME_ZONE = 'America/Detroit';

export function buildUserAgent(contactEmail: string): string {
  return `MaizeBites/0.1 (UMich free-food tracker; contact: ${contactEmail})`;
}

export interface HttpOptions {
  userAgent: string;
  fetchFn?: typeof fetch;
  /** Per request. Default 10s. */
  timeoutMs?: number;
  /** Total tries per request, including the first. Default 4. */
  maxAttempts?: number;
  /** Backoff is baseDelayMs * 2^(attempt-1) plus up to 50% jitter. Default 2s. */
  baseDelayMs?: number;
  /** Cap for any single wait, including Retry-After. Default 60s. */
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: Pick<Console, 'warn'>;
}

export class FeedHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'FeedHttpError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (header === null) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/** GET a JSON URL politely: fixed User-Agent, timeout, exponential backoff on 429/5xx/network errors. */
export async function getJson(url: URL, options: HttpOptions): Promise<unknown> {
  const {
    userAgent,
    fetchFn = (...args) => fetch(...args),
    timeoutMs = 10_000,
    maxAttempts = 4,
    baseDelayMs = 2_000,
    maxDelayMs = 60_000,
    sleep = defaultSleep,
    random = Math.random,
    logger = console,
  } = options;

  for (let attempt = 1; ; attempt++) {
    let error: FeedHttpError;
    let waitHint: number | null = null;
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const body: unknown = await res.json();
        return body;
      }
      // A Cloudflare bot challenge can't be answered by this client and retrying won't clear it.
      const challenged = res.headers.get('cf-mitigated') === 'challenge';
      const retryable = !challenged && (res.status === 429 || res.status >= 500);
      waitHint = retryable ? retryAfterMs(res) : null;
      error = new FeedHttpError(
        `GET ${url.pathname}${url.search} → HTTP ${res.status}${challenged ? ' (blocked by a Cloudflare challenge)' : ''}`,
        retryable,
      );
    } catch (cause) {
      // Network failure, timeout (AbortSignal), or invalid JSON body: all worth retrying.
      error = new FeedHttpError(
        `GET ${url.pathname}${url.search} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        true,
      );
    }

    if (!error.retryable || attempt >= maxAttempts) throw error;
    const backoff = baseDelayMs * 2 ** (attempt - 1);
    const delay = Math.min(maxDelayMs, waitHint ?? backoff + random() * backoff * 0.5);
    logger.warn(
      `[ingest] ${error.message}; retry ${attempt}/${maxAttempts - 1} in ${Math.round(delay)}ms`,
    );
    await sleep(delay);
  }
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
