import type { HostRateLimiter } from './rate-limit.js';
import type { RobotsChecker } from './robots.js';

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
  /** When set, a URL that robots.txt disallows (or whose robots.txt can't be read) is never requested. */
  robots?: RobotsChecker;
  /** When set, requests to one host are spaced out. */
  rateLimiter?: HostRateLimiter;
}

/** `challenge` and `robots` mean the site said no; callers must not look for another way in. */
export type FeedErrorKind = 'http' | 'challenge' | 'robots';

export class FeedHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly kind: FeedErrorKind = 'http',
  ) {
    super(message);
    this.name = 'FeedHttpError';
  }
}

/** True when the site refused us on purpose, so trying another URL on it would be evasion. */
export function isRefusal(error: unknown): boolean {
  return error instanceof FeedHttpError && error.kind !== 'http';
}

export interface Validators {
  etag: string | null;
  lastModified: string | null;
}

export type HttpResult<T> =
  { status: 'not_modified' } | { status: 'ok'; body: T; validators: Validators };

export interface HttpRequest<T> {
  accept: string;
  /** Reads the body of a 2xx response. A throw here counts as a failed attempt and is retried. */
  parse: (res: Response) => Promise<T>;
  /** From the last 200 for this URL; sent as If-None-Match / If-Modified-Since. */
  validators?: Validators | null;
}

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (header === null) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/**
 * GET a feed politely: identified User-Agent, robots.txt and per-host spacing when configured,
 * conditional requests, a timeout, and exponential backoff on 429/5xx/network errors.
 * A Cloudflare challenge or a robots.txt refusal fails at once and is never retried.
 */
export async function httpGet<T>(
  url: URL,
  options: HttpOptions,
  request: HttpRequest<T>,
): Promise<HttpResult<T>> {
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
    robots,
    rateLimiter,
  } = options;

  let crawlDelayMs: number | null = null;
  if (robots) {
    const verdict = await robots.check(url);
    if (!verdict.allowed)
      throw new FeedHttpError(
        `GET ${url.pathname}${url.search} not sent: ${verdict.reason ?? 'robots.txt disallows it'}`,
        false,
        'robots',
      );
    crawlDelayMs = verdict.crawlDelayMs;
  }

  const headers: Record<string, string> = { 'User-Agent': userAgent, Accept: request.accept };
  if (request.validators?.etag) headers['If-None-Match'] = request.validators.etag;
  if (request.validators?.lastModified)
    headers['If-Modified-Since'] = request.validators.lastModified;

  for (let attempt = 1; ; attempt++) {
    let error: FeedHttpError;
    let waitHint: number | null = null;
    await rateLimiter?.wait(url.host, crawlDelayMs);
    try {
      const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 304 && request.validators) return { status: 'not_modified' };
      if (res.ok) {
        const body = await request.parse(res);
        return {
          status: 'ok',
          body,
          validators: {
            etag: res.headers.get('etag'),
            lastModified: res.headers.get('last-modified'),
          },
        };
      }
      // A Cloudflare bot challenge can't be answered by this client and retrying won't clear it.
      const challenged = res.headers.get('cf-mitigated') === 'challenge';
      const retryable = !challenged && (res.status === 429 || res.status >= 500);
      waitHint = retryable ? retryAfterMs(res) : null;
      error = new FeedHttpError(
        `GET ${url.pathname}${url.search} → HTTP ${res.status}${challenged ? ' (blocked by a Cloudflare challenge)' : ''}`,
        retryable,
        challenged ? 'challenge' : 'http',
      );
    } catch (cause) {
      // Network failure, timeout (AbortSignal), or an unreadable body: all worth retrying.
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

export function buildUserAgent(contactEmail: string): string {
  return `MaizeBites/0.1 (UMich free-food tracker; contact: ${contactEmail})`;
}
