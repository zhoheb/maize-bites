import { describe, expect, it, vi } from 'vitest';
import { maizepagesIcs, maizepagesRss } from '../../test/fixture.js';
import { FeedHttpError } from '../http/client.js';
import {
  MAIZEPAGES_ICS_URL,
  MAIZEPAGES_RSS_URL,
  createMaizepagesSource,
  type ValidatorStore,
} from './index.js';

const FROM = new Date('2026-10-09T04:10:00Z');

function harness(...steps: (Response | Error)[]) {
  const fetchFn = vi.fn((..._args: Parameters<typeof fetch>) => {
    const next = steps.shift();
    if (next === undefined) throw new Error('unexpected extra request');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const stored = new Map<string, { etag: string | null; lastModified: string | null }>();
  const validators: ValidatorStore = {
    get: (url) => Promise.resolve(stored.get(url) ?? null),
    save: (url, v) => {
      stored.set(url, v);
      return Promise.resolve();
    },
  };
  const logger = { warn: vi.fn() };
  const source = createMaizepagesSource({
    http: {
      userAgent: 'MaizeBites/0.1 (test)',
      fetchFn,
      // One attempt per URL keeps the request sequences below easy to read.
      maxAttempts: 1,
      sleep: () => Promise.resolve(),
      logger,
    },
    validators,
    logger,
  });
  const requested = () => fetchFn.mock.calls.map(([url]) => (url as URL).href);
  return { source, fetchFn, stored, logger, requested };
}

describe('createMaizepagesSource', () => {
  it('waits at least the feed ttl (5h, less a minute of slack) between runs', () => {
    expect(harness().source).toMatchObject({ id: 'maizepages', minIntervalMs: 299 * 60_000 });
  });

  it('reads events.ics and remembers its validators', async () => {
    const { source, stored, requested } = harness(
      new Response(maizepagesIcs, { headers: { ETag: '"abc"' } }),
    );

    const result = await source.fetch(FROM);

    expect(requested()).toEqual([MAIZEPAGES_ICS_URL]);
    expect(result).toMatchObject({
      status: 'ok',
      complete: true,
      ttlMinutes: null,
      // Seven days out, less an hour.
      windowEnd: new Date('2026-10-16T03:10:00Z'),
    });
    expect(result.status === 'ok' && result.items).toHaveLength(27);
    expect(stored.get(MAIZEPAGES_ICS_URL)).toEqual({ etag: '"abc"', lastModified: null });
  });

  it('sends the stored validators and reports a 304 as not modified', async () => {
    const { source, stored, fetchFn } = harness(new Response(null, { status: 304 }));
    stored.set(MAIZEPAGES_ICS_URL, { etag: '"abc"', lastModified: null });

    expect(await source.fetch(FROM)).toEqual({ status: 'not_modified' });
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ 'If-None-Match': '"abc"' });
  });

  it('falls back to events.rss when the ICS request fails, and reports the ttl', async () => {
    const { source, requested, logger } = harness(
      new Response('', { status: 500 }),
      new Response(maizepagesRss),
    );

    const result = await source.fetch(FROM);

    expect(requested()).toEqual([MAIZEPAGES_ICS_URL, MAIZEPAGES_RSS_URL]);
    expect(result).toMatchObject({ status: 'ok', complete: true, ttlMinutes: 300 });
    expect(result.status === 'ok' && result.items).toHaveLength(27);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/events\.ics failed .*HTTP 500/),
    );
  });

  it('falls back when the ICS body is not a calendar, and does not keep its validators', async () => {
    const { source, stored, requested } = harness(
      new Response('<html>maintenance</html>', { headers: { ETag: '"junk"' } }),
      new Response(maizepagesRss),
    );

    expect((await source.fetch(FROM)).status).toBe('ok');
    expect(requested()).toEqual([MAIZEPAGES_ICS_URL, MAIZEPAGES_RSS_URL]);
    expect(stored.has(MAIZEPAGES_ICS_URL)).toBe(false);
  });

  it('stops at a Cloudflare challenge: no RSS attempt', async () => {
    const { source, requested } = harness(
      new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }),
    );

    await expect(source.fetch(FROM)).rejects.toMatchObject({ kind: 'challenge' });
    expect(requested()).toEqual([MAIZEPAGES_ICS_URL]);
  });

  it('stops when robots.txt refuses us: no request at all', async () => {
    const { fetchFn } = harness();
    const source = createMaizepagesSource({
      http: {
        userAgent: 'MaizeBites/0.1 (test)',
        fetchFn,
        robots: {
          check: () =>
            Promise.resolve({
              allowed: false,
              crawlDelayMs: null,
              reason: 'robots.txt disallows /events.ics',
            }),
        },
      },
      validators: { get: () => Promise.resolve(null), save: () => Promise.resolve() },
      logger: { warn: vi.fn() },
    });

    await expect(source.fetch(FROM)).rejects.toBeInstanceOf(FeedHttpError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails the run when both feeds fail', async () => {
    const { source } = harness(
      new Response('', { status: 500 }),
      new Response('', { status: 502 }),
    );
    await expect(source.fetch(FROM)).rejects.toThrow('HTTP 502');
  });

  it('normalize reports an invalid item by position instead of throwing', () => {
    const { source } = harness();
    const result = source.normalize({ format: 'ics', id: null, title: 'No id' }, 3);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/^item #3 failed validation/);
  });
});
