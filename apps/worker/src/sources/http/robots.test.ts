import { describe, expect, it, vi } from 'vitest';
import { createRobotsChecker, parseRobots } from './robots.js';

// maizepages.umich.edu/robots.txt as fetched 2026-10-09.
const MAIZEPAGES = `Sitemap: https://maizepages.umich.edu/sitemap.xml

User-agent: *
Disallow: /notfound
Disallow: /forbidden
Disallow: /error
Disallow: /api/
Disallow: /engage/
`;

describe('parseRobots', () => {
  it('reads the Maize Pages file: feeds allowed, /api/ and /engage/ not', () => {
    const rules = parseRobots(MAIZEPAGES, 'maizebites');
    expect(rules.isAllowed('/events.ics')).toBe(true);
    expect(rules.isAllowed('/events.rss')).toBe(true);
    expect(rules.isAllowed('/api/discovery/event/search?take=10')).toBe(false);
    expect(rules.isAllowed('/engage/events')).toBe(false);
    expect(rules.crawlDelayMs).toBeNull();
  });

  it('lets the longest match win, and Allow win a tie', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /tie\nAllow: /tie',
      'maizebites',
    );
    expect(rules.isAllowed('/wp-admin/options.php')).toBe(false);
    expect(rules.isAllowed('/wp-admin/admin-ajax.php')).toBe(true);
    expect(rules.isAllowed('/tie')).toBe(true);
  });

  it('supports * and $ in patterns', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*?calendar\nDisallow: /*.pdf$', 'x');
    expect(rules.isAllowed('/events?calendar=1')).toBe(false);
    expect(rules.isAllowed('/a/b.pdf')).toBe(false);
    expect(rules.isAllowed('/a/b.pdf?download')).toBe(true);
    expect(rules.isAllowed('/events')).toBe(true);
  });

  it('uses a group that names us instead of *', () => {
    const text = 'User-agent: *\nDisallow:\n\nUser-agent: MaizeBites\nDisallow: /\n';
    expect(parseRobots(text, 'maizebites').isAllowed('/events.ics')).toBe(false);
    expect(parseRobots(text, 'otherbot').isAllowed('/events.ics')).toBe(true);
  });

  it('treats Disallow: / as everything, and an empty Disallow as nothing', () => {
    expect(parseRobots('User-agent: *\nDisallow: /', 'x').isAllowed('/anything')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow:', 'x').isAllowed('/anything')).toBe(true);
    expect(parseRobots('', 'x').isAllowed('/anything')).toBe(true);
  });

  it('shares rules between stacked User-agent lines and reads Crawl-delay', () => {
    const rules = parseRobots(
      'User-agent: a\nUser-agent: *\nDisallow: /private # comment\nCrawl-delay: 10',
      'maizebites',
    );
    expect(rules.isAllowed('/private/x')).toBe(false);
    expect(rules.crawlDelayMs).toBe(10_000);
  });
});

describe('createRobotsChecker', () => {
  const ICS = new URL('https://maizepages.umich.edu/events.ics');
  const checker = (fetchFn: typeof fetch, now = () => 0) =>
    createRobotsChecker({ userAgent: 'MaizeBites/0.1 (test)', fetchFn, now });

  it('fetches robots.txt once per host with our User-Agent and caches the rules', async () => {
    const fetchFn = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(new Response(MAIZEPAGES)),
    );
    const robots = checker(fetchFn);

    expect(await robots.check(ICS)).toEqual({ allowed: true, crawlDelayMs: null, reason: null });
    expect(await robots.check(new URL('https://maizepages.umich.edu/api/discovery'))).toEqual({
      allowed: false,
      crawlDelayMs: null,
      reason: 'robots.txt disallows /api/discovery',
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toEqual(new URL('https://maizepages.umich.edu/robots.txt'));
    expect(init?.headers).toMatchObject({ 'User-Agent': 'MaizeBites/0.1 (test)' });
  });

  it('allows everything when there is no robots.txt', async () => {
    const robots = checker(() => Promise.resolve(new Response('nope', { status: 404 })));
    expect((await robots.check(ICS)).allowed).toBe(true);
  });

  it('fails closed on a Cloudflare challenge, an error status, or a network failure', async () => {
    const challenge = checker(() =>
      Promise.resolve(new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } })),
    );
    expect(await challenge.check(ICS)).toMatchObject({
      allowed: false,
      reason: 'robots.txt is behind a Cloudflare challenge (HTTP 403)',
    });

    const serverError = checker(() => Promise.resolve(new Response('', { status: 503 })));
    expect(await serverError.check(ICS)).toMatchObject({
      allowed: false,
      reason: 'robots.txt returned HTTP 503',
    });

    const offline = checker(() => Promise.reject(new Error('getaddrinfo ENOTFOUND')));
    expect((await offline.check(ICS)).reason).toMatch(/could not be fetched: getaddrinfo/);
  });

  it('refetches after the cache expires: 24h for rules, 1h for a failure', async () => {
    let clock = 0;
    const responses = [new Response('', { status: 500 }), new Response(MAIZEPAGES)];
    const fetchFn = vi.fn(() => Promise.resolve(responses.shift() ?? new Response(MAIZEPAGES)));
    const robots = checker(fetchFn, () => clock);

    expect((await robots.check(ICS)).allowed).toBe(false);
    clock = 3_600_000 - 1;
    expect((await robots.check(ICS)).allowed).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock = 3_600_000;
    expect((await robots.check(ICS)).allowed).toBe(true);
    clock += 24 * 3_600_000 - 1;
    await robots.check(ICS);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    clock += 1;
    await robots.check(ICS);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
