import { describe, expect, it, vi } from 'vitest';
import { fetchHappeningWindow } from '../happening/client.js';
import {
  HAPPENING_HOST,
  HAPPENING_INTEGRATION_HEADER,
  happeningIntegrationHeader,
} from '../happening/index.js';
import { buildUserAgent, httpGet, type HttpOptions } from './client.js';
import { createRobotsChecker } from './robots.js';

// A stand-in secret. The assertions below make sure it never reaches a log line or an error.
const TOKEN = 'test-token-not-real-123';
const SITE = 'https://maizebites.example';
const HEADER_VALUE = `${TOKEN} ${SITE}`;
const hostHeaders = { [HAPPENING_HOST]: happeningIntegrationHeader(TOKEN, SITE) };
const text = { accept: 'text/plain', parse: (res: Response) => res.text() };

function harness(...steps: Response[]) {
  const fetchFn = vi.fn((..._args: Parameters<typeof fetch>) => {
    const next = steps.shift();
    if (next === undefined) throw new Error('unexpected extra request');
    return Promise.resolve(next);
  });
  const logger = { warn: vi.fn() };
  const options: HttpOptions = {
    userAgent: buildUserAgent('me@umich.edu'),
    fetchFn,
    sleep: () => Promise.resolve(),
    random: () => 0,
    logger,
    hostHeaders,
  };
  const sent = (call = 0) => fetchFn.mock.calls[call]?.[1]?.headers as Record<string, string>;
  const logged = () => JSON.stringify(logger.warn.mock.calls);
  return { fetchFn, options, logger, sent, logged };
}

/** The error a request that must fail fails with. */
async function failure(request: Promise<unknown>): Promise<Error> {
  try {
    await request;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the request to fail');
}

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { Location: location } });

describe('the Happening integration header', () => {
  it('has the exact format "<token> <site URL>"', () => {
    expect(happeningIntegrationHeader(TOKEN, SITE)).toEqual({
      'x-umich-integration': 'test-token-not-real-123 https://maizebites.example',
    });
    expect(HAPPENING_HOST).toBe('events.umich.edu');
  });

  it('goes on every feed request to events.umich.edu, next to the User-Agent', async () => {
    const page = (n: number) =>
      Response.json(Array.from({ length: n }, (_, i) => ({ id: `1-${i}` })));
    const { fetchFn, options, sent } = harness(page(200), page(3));

    await fetchHappeningWindow(options, { from: new Date('2026-10-09T16:00:00Z') });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    for (const call of [0, 1]) {
      expect((fetchFn.mock.calls[call]?.[0] as URL).hostname).toBe('events.umich.edu');
      expect(sent(call)).toEqual({
        'User-Agent': 'MaizeBites/0.1 (UMich free-food tracker; contact: me@umich.edu)',
        Accept: 'application/json',
        'x-umich-integration': HEADER_VALUE,
      });
    }
  });

  it('is not sent to maizepages.umich.edu or any other host, with the same client options', async () => {
    for (const url of [
      'https://maizepages.umich.edu/events.ics',
      'https://umich.edu/',
      // Look-alikes: a subdomain, a suffix, and a different scheme-relative trick.
      'https://www.events.umich.edu/list/json',
      'https://events.umich.edu.example.com/list/json',
      'https://notevents.umich.edu/list/json',
    ]) {
      const { options, sent } = harness(new Response('ok'));
      await httpGet(new URL(url), options, text);
      expect(sent(), url).not.toHaveProperty(HAPPENING_INTEGRATION_HEADER);
      expect(JSON.stringify(sent()), url).not.toContain(TOKEN);
    }
  });

  it('follows a redirect within events.umich.edu, still with the header', async () => {
    const { fetchFn, options, sent } = harness(
      redirect('/list/json?v=2&moved=1'),
      new Response('[]'),
    );

    await httpGet(new URL('https://events.umich.edu/list/json?v=2'), options, text);

    expect((fetchFn.mock.calls[1]?.[0] as URL).href).toBe(
      'https://events.umich.edu/list/json?v=2&moved=1',
    );
    expect(sent(1)[HAPPENING_INTEGRATION_HEADER]).toBe(HEADER_VALUE);
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('never follows a redirect to another host: no second request, so the header cannot leak', async () => {
    for (const location of [
      'https://login.umich.edu/?next=feed',
      'https://maizepages.umich.edu/events.ics',
      'http://events.umich.edu/list/json', // same host, downgraded to plain http
      '//evil.example/collect',
    ]) {
      const { fetchFn, options } = harness(redirect(location));

      const error = await failure(
        httpGet(new URL('https://events.umich.edu/list/json?v=2'), options, text),
      );

      expect(error, location).toMatchObject({ retryable: false });
      expect(error.message).toMatch(/redirected to another host .*not followed/);
      expect(fetchFn, location).toHaveBeenCalledTimes(1);
    }
  });

  it('gives up on a redirect loop', async () => {
    const { fetchFn, options } = harness(
      ...Array.from({ length: 4 }, () => redirect('/list/json?again')),
    );
    await expect(
      httpGet(new URL('https://events.umich.edu/list/json'), options, text),
    ).rejects.toThrow('too many redirects');
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('leaves redirects to fetch for hosts without a header', async () => {
    const { fetchFn, options } = harness(new Response('ok'));
    await httpGet(new URL('https://maizepages.umich.edu/events.ics'), options, text);
    expect(fetchFn.mock.calls[0]?.[1]).not.toHaveProperty('redirect');
  });

  it('keeps the token out of error messages and retry logs', async () => {
    const failing = harness(
      new Response('', { status: 503 }),
      new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }),
    );
    const error = await failure(
      httpGet(new URL('https://events.umich.edu/list/json?v=2'), failing.options, text),
    );

    expect(failing.logger.warn).toHaveBeenCalledTimes(1); // the 503 retry
    for (const output of [error.message, String(error.stack), failing.logged()]) {
      expect(output).not.toContain(TOKEN);
      expect(output).not.toContain(HAPPENING_INTEGRATION_HEADER);
    }
  });

  it('is sent with robots.txt for that host only, and never across a redirect', async () => {
    const fetchFn = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(new Response('', { status: 404 })),
    );
    const robots = createRobotsChecker({
      userAgent: 'MaizeBites/0.1 (test)',
      fetchFn,
      hostHeaders,
    });

    await robots.check(new URL('https://events.umich.edu/list/json'));
    await robots.check(new URL('https://maizepages.umich.edu/events.ics'));

    const [happening, maizepages] = fetchFn.mock.calls.map(([, init]) => init);
    expect(happening?.headers).toMatchObject({ [HAPPENING_INTEGRATION_HEADER]: HEADER_VALUE });
    expect(happening?.redirect).toBe('manual');
    expect(maizepages?.headers).not.toHaveProperty(HAPPENING_INTEGRATION_HEADER);

    const redirected = createRobotsChecker({
      userAgent: 'MaizeBites/0.1 (test)',
      fetchFn: () => Promise.resolve(redirect('https://elsewhere.example/robots.txt')),
      hostHeaders,
    });
    expect(await redirected.check(new URL('https://events.umich.edu/list/json'))).toMatchObject({
      allowed: false,
      reason: 'robots.txt redirected (HTTP 302); not followed',
    });
  });
});
