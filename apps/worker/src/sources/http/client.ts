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
  /**
   * Extra headers for exact hostnames, e.g. an access token one site issued us. They are sent
   * only when the request URL's hostname is exactly the key, and never follow a redirect to
   * another host. Values are secrets: they are never logged or put in error messages.
   */
  hostHeaders?: HostHeaders;
}

export type HostHeaders = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** The headers configured for exactly this URL's hostname, if any. */
export function headersForHost(
  hostHeaders: HostHeaders | undefined,
  url: URL,
): Record<string, string> {
  const headers =
    hostHeaders && Object.hasOwn(hostHeaders, url.hostname) ? hostHeaders[url.hostname] : undefined;
  return { ...headers };
}

/** How many same-host redirects to follow when host headers are in play. */
const MAX_SAME_HOST_REDIRECTS = 3;

/** `challenge` and `robots` mean the site said no; callers must not look for another way in. */
export type FeedErrorKind = 'http' | 'challenge' | 'robots';

export class FeedHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly kind: FeedErrorKind = 'http',
    /** The HTTP status, when the failure was a response. */
    readonly status?: number,
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
    hostHeaders,
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

  const secret = headersForHost(hostHeaders, url);
  const hasSecret = Object.keys(secret).length > 0;

  /**
   * One request. With host headers, redirects are followed by hand so the headers can be
   * dropped the moment a redirect points at a different host; otherwise fetch follows them.
   */
  const send = async (): Promise<Response> => {
    if (!hasSecret) return fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    let target = url;
    for (let hop = 0; ; hop++) {
      const res = await fetchFn(target, {
        headers: { ...headers, ...headersForHost(hostHeaders, target) },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (location === null) return res;
      const next = new URL(location, target);
      if (next.hostname !== url.hostname || next.protocol !== url.protocol)
        throw new FeedHttpError(
          `GET ${url.pathname}${url.search} → redirected to another host (${next.hostname}); not followed`,
          false,
        );
      if (hop >= MAX_SAME_HOST_REDIRECTS)
        throw new FeedHttpError(`GET ${url.pathname}${url.search} → too many redirects`, false);
      target = next;
    }
  };

  for (let attempt = 1; ; attempt++) {
    let error: FeedHttpError;
    let waitHint: number | null = null;
    await rateLimiter?.wait(url.host, crawlDelayMs);
    try {
      const res = await send();
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
        res.status,
      );
    } catch (cause) {
      // A refusal to follow a redirect is final, not a network blip.
      if (cause instanceof FeedHttpError) throw cause;
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
