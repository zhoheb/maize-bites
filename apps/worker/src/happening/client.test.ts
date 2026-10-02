import { describe, expect, it, vi } from 'vitest';
import { buildUserAgent, fetchHappeningWindow, getJson, type HttpOptions } from './client.js';

const URL_ = new URL('https://events.umich.edu/list/json?v=2');
const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init);

function http(fetchFn: typeof fetch, overrides: Partial<HttpOptions> = {}) {
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const options: HttpOptions = {
    userAgent: buildUserAgent('me@umich.edu'),
    fetchFn,
    sleep,
    random: () => 0,
    logger: { warn: vi.fn() },
    ...overrides,
  };
  return { options, sleep };
}

/** fetch stub returning the given responses (or throwing given errors) in order. */
function sequence(...steps: (Response | Error)[]) {
  return vi.fn((..._args: Parameters<typeof fetch>) => {
    const next = steps.shift();
    if (next === undefined) throw new Error('unexpected extra request');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

describe('buildUserAgent', () => {
  it('identifies the app and includes the contact email', () => {
    expect(buildUserAgent('me@umich.edu')).toBe(
      'MaizeBites/0.1 (UMich free-food tracker; contact: me@umich.edu)',
    );
  });
});

describe('getJson', () => {
  it('sends the User-Agent and a 10s timeout signal', async () => {
    const fetchFn = sequence(json([]));
    await getJson(URL_, http(fetchFn).options);

    const init = fetchFn.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('User-Agent')).toContain('contact: me@umich.edu');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts requests that exceed the timeout', async () => {
    const fetchFn = vi.fn(
      (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const { options } = http(fetchFn, { timeoutMs: 20, maxAttempts: 2 });

    await expect(getJson(URL_, options)).rejects.toThrow(/timeout|aborted/i);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx and network errors with exponential backoff', async () => {
    const fetchFn = sequence(
      new Response('', { status: 503 }),
      new TypeError('fetch failed'),
      json(['ok']),
    );
    const { options, sleep } = http(fetchFn);

    await expect(getJson(URL_, options)).resolves.toEqual(['ok']);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2_000, 4_000]);
  });

  it('honors Retry-After on 429', async () => {
    const fetchFn = sequence(
      new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
      json([]),
    );
    const { options, sleep } = http(fetchFn);

    await getJson(URL_, options);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it('caps waits at maxDelayMs', async () => {
    const fetchFn = sequence(
      new Response('', { status: 429, headers: { 'Retry-After': '3600' } }),
      json([]),
    );
    const { options, sleep } = http(fetchFn);

    await getJson(URL_, options);
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it('gives up after maxAttempts', async () => {
    const fetchFn = sequence(...Array.from({ length: 4 }, () => new Response('', { status: 500 })));
    const { options, sleep } = http(fetchFn);

    await expect(getJson(URL_, options)).rejects.toThrow('HTTP 500');
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('does not retry other 4xx responses', async () => {
    const fetchFn = sequence(new Response('', { status: 404 }));
    await expect(getJson(URL_, http(fetchFn).options)).rejects.toThrow('HTTP 404');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('fetchHappeningWindow', () => {
  const from = new Date('2026-10-01T03:30:00Z'); // Sep 30, 11:30pm in Ann Arbor
  const items = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

  it('requests a local-date range and pages until a short page', async () => {
    const fetchFn = sequence(json(items('1', 2)), json(items('2', 2)), json(items('3', 1)));
    const { options, sleep } = http(fetchFn);

    const window = await fetchHappeningWindow(options, { from, days: 14, pageSize: 2 });

    // 14 local days: Sep 30 through Oct 13; window ends at local midnight starting Oct 14 (EDT).
    expect(window).toMatchObject({
      complete: true,
      pages: 3,
      windowEnd: new Date('2026-10-14T04:00:00Z'),
    });
    expect(window.items).toHaveLength(5);
    const urls = fetchFn.mock.calls.map(([url]) => new URL(url as URL));
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(urls[0]?.searchParams.get('range')).toBe('2026-09-30to2026-10-13');
    expect(urls[0]?.searchParams.get('max-results')).toBe('2');
    // Polite pause between pages, not before the first.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 1_000]);
  });

  it('deduplicates items that shift across pages', async () => {
    const fetchFn = sequence(json([{ id: 'a' }, { id: 'b' }]), json([{ id: 'b' }]));
    const window = await fetchHappeningWindow(http(fetchFn).options, { from, pageSize: 2 });
    expect(window.items).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('reports an incomplete window when it hits maxPages', async () => {
    const fetchFn = sequence(json(items('1', 2)), json(items('2', 2)));
    const window = await fetchHappeningWindow(http(fetchFn).options, {
      from,
      pageSize: 2,
      maxPages: 2,
    });
    expect(window).toMatchObject({ complete: false, pages: 2 });
  });

  it('rejects a response that is not an array', async () => {
    const fetchFn = sequence(json({ error: 'nope' }));
    await expect(fetchHappeningWindow(http(fetchFn).options, { from })).rejects.toThrow(
      /not a JSON array/,
    );
  });
});
