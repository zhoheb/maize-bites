import { describe, expect, it, vi } from 'vitest';
import { FeedHttpError, httpGet, isRefusal, type HttpOptions } from './client.js';
import type { RobotsVerdict } from './robots.js';

// Retries, backoff, and Retry-After are covered through getJson in ../happening/client.test.ts.
const URL_ = new URL('https://maizepages.umich.edu/events.ics');
const text = { accept: 'text/calendar', parse: (res: Response) => res.text() };

function sequence(...steps: Response[]) {
  return vi.fn((..._args: Parameters<typeof fetch>) => {
    const next = steps.shift();
    if (next === undefined) throw new Error('unexpected extra request');
    return Promise.resolve(next);
  });
}

function options(fetchFn: typeof fetch, overrides: Partial<HttpOptions> = {}): HttpOptions {
  return {
    userAgent: 'MaizeBites/0.1 (test)',
    fetchFn,
    sleep: () => Promise.resolve(),
    random: () => 0,
    logger: { warn: vi.fn() },
    ...overrides,
  };
}

const headersOf = (fetchFn: ReturnType<typeof sequence>, call = 0) =>
  fetchFn.mock.calls[call]?.[1]?.headers as Record<string, string>;

describe('httpGet conditional requests', () => {
  it('returns the body with the validators the server sent', async () => {
    const fetchFn = sequence(
      new Response('BEGIN:VCALENDAR', {
        headers: { ETag: '"v1"', 'Last-Modified': 'Fri, 09 Oct 2026 04:03:14 GMT' },
      }),
    );
    expect(await httpGet(URL_, options(fetchFn), text)).toEqual({
      status: 'ok',
      body: 'BEGIN:VCALENDAR',
      validators: { etag: '"v1"', lastModified: 'Fri, 09 Oct 2026 04:03:14 GMT' },
    });
    expect(headersOf(fetchFn)).toEqual({
      'User-Agent': 'MaizeBites/0.1 (test)',
      Accept: 'text/calendar',
    });
  });

  it('sends If-None-Match and If-Modified-Since and reports a 304', async () => {
    const fetchFn = sequence(new Response(null, { status: 304 }));
    const validators = { etag: '"v1"', lastModified: 'Fri, 09 Oct 2026 04:03:14 GMT' };

    expect(await httpGet(URL_, options(fetchFn), { ...text, validators })).toEqual({
      status: 'not_modified',
    });
    expect(headersOf(fetchFn)).toMatchObject({
      'If-None-Match': '"v1"',
      'If-Modified-Since': 'Fri, 09 Oct 2026 04:03:14 GMT',
    });
  });

  it('sends only the validators it has', async () => {
    const fetchFn = sequence(new Response('x'));
    await httpGet(URL_, options(fetchFn), {
      ...text,
      validators: { etag: null, lastModified: 'Fri, 09 Oct 2026 04:03:14 GMT' },
    });
    expect(headersOf(fetchFn)).not.toHaveProperty('If-None-Match');
    expect(headersOf(fetchFn)).toHaveProperty('If-Modified-Since');
  });

  it('treats an unrequested 304 as an error rather than "no change"', async () => {
    const fetchFn = sequence(new Response(null, { status: 304 }));
    await expect(httpGet(URL_, options(fetchFn), text)).rejects.toThrow('HTTP 304');
  });
});

describe('httpGet refusals', () => {
  const robots = (verdict: RobotsVerdict) => ({ check: vi.fn(() => Promise.resolve(verdict)) });

  it('never sends a request robots.txt disallows', async () => {
    const fetchFn = sequence();
    const error = await httpGet(
      new URL('https://maizepages.umich.edu/api/discovery/event/search'),
      options(fetchFn, {
        robots: robots({
          allowed: false,
          crawlDelayMs: null,
          reason: 'robots.txt disallows /api/discovery/event/search',
        }),
      }),
      text,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FeedHttpError);
    expect(error).toMatchObject({ kind: 'robots', retryable: false });
    expect((error as Error).message).toMatch(/not sent: robots\.txt disallows/);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(isRefusal(error)).toBe(true);
  });

  it('marks a Cloudflare challenge as a refusal and does not retry it', async () => {
    const fetchFn = sequence(
      new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }),
    );
    const error = await httpGet(URL_, options(fetchFn), text).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'challenge', retryable: false });
    expect(isRefusal(error)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not call an ordinary failure a refusal', async () => {
    const fetchFn = sequence(new Response('', { status: 404 }));
    const error = await httpGet(URL_, options(fetchFn), text).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'http', retryable: false });
    expect(isRefusal(error)).toBe(false);
    expect(isRefusal(new Error('boom'))).toBe(false);
  });
});

describe('httpGet pacing', () => {
  it('waits on the rate limiter before every attempt, passing the Crawl-delay', async () => {
    const fetchFn = sequence(new Response('', { status: 503 }), new Response('ok'));
    const wait = vi.fn(() => Promise.resolve());
    const check = () => Promise.resolve({ allowed: true, crawlDelayMs: 10_000, reason: null });

    await httpGet(URL_, options(fetchFn, { rateLimiter: { wait }, robots: { check } }), text);

    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith('maizepages.umich.edu', 10_000);
  });
});
