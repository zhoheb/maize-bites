import { headersForHost, type HostHeaders } from './client.js';

// A small robots.txt reader (RFC 9309): groups by user agent, Allow/Disallow with `*` and `$`,
// longest match wins, Allow wins ties. Plus Crawl-delay, which the RFC leaves out but sites use.

export interface RobotsRules {
  /** `path` is the URL path plus query string. */
  isAllowed: (path: string) => boolean;
  crawlDelayMs: number | null;
}

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Rules that apply to `productToken`: its own group if the file names it, otherwise `*`. */
export function parseRobots(text: string, productToken: string): RobotsRules {
  const token = productToken.toLowerCase();
  const groups: { agents: string[]; rules: Rule[]; crawlDelayMs: number | null }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      // An empty Disallow means "nothing is disallowed".
      if (value !== '')
        current.rules.push({ allow: key === 'allow', pattern: value, regex: toRegex(value) });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = seconds * 1000;
    }
  }

  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const applicable = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));
  const rules = applicable.flatMap((g) => g.rules);
  const delays = applicable.map((g) => g.crawlDelayMs).filter((d): d is number => d !== null);

  return {
    crawlDelayMs: delays.length > 0 ? Math.max(...delays) : null,
    isAllowed: (path) => {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!rule.regex.test(path)) continue;
        if (
          best === null ||
          rule.pattern.length > best.pattern.length ||
          (rule.pattern.length === best.pattern.length && rule.allow)
        )
          best = rule;
      }
      return best?.allow ?? true;
    },
  };
}

export interface RobotsVerdict {
  allowed: boolean;
  crawlDelayMs: number | null;
  /** Why not, when `allowed` is false. */
  reason: string | null;
}

export interface RobotsChecker {
  check: (url: URL) => Promise<RobotsVerdict>;
}

type Cached = { rules: RobotsRules } | { unavailable: string };

/**
 * Fetches and caches robots.txt per host. A missing file (404/410) allows everything. Anything
 * that leaves the rules unknown (a bot challenge, another error status, a network failure)
 * disallows everything: we don't fetch from a site whose rules we couldn't read.
 */
export function createRobotsChecker(options: {
  userAgent: string;
  /** Name matched against User-agent lines. */
  productToken?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  /** How long parsed rules are reused. Default 24h. */
  okTtlMs?: number;
  /** How long a failed lookup is remembered before trying again. Default 1h. */
  failTtlMs?: number;
  /** Per-host access headers, as in HttpOptions. A host that needs one needs it for robots.txt too. */
  hostHeaders?: HostHeaders;
}): RobotsChecker {
  const {
    userAgent,
    productToken = 'maizebites',
    fetchFn = (...args) => fetch(...args),
    timeoutMs = 10_000,
    now = Date.now,
    okTtlMs = 24 * 3_600_000,
    failTtlMs = 3_600_000,
    hostHeaders,
  } = options;
  const cache = new Map<string, { value: Cached; expiresAt: number }>();

  async function load(origin: string): Promise<Cached> {
    try {
      const url = new URL('/robots.txt', origin);
      const secret = headersForHost(hostHeaders, url);
      const res = await fetchFn(url, {
        headers: { 'User-Agent': userAgent, Accept: 'text/plain', ...secret },
        // With an access header, never let fetch carry it across a redirect.
        ...(Object.keys(secret).length > 0 ? { redirect: 'manual' as const } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400)
        return { unavailable: `robots.txt redirected (HTTP ${res.status}); not followed` };
      if (res.headers.get('cf-mitigated') === 'challenge')
        return { unavailable: `robots.txt is behind a Cloudflare challenge (HTTP ${res.status})` };
      if (res.status === 404 || res.status === 410)
        return { rules: { isAllowed: () => true, crawlDelayMs: null } };
      if (!res.ok) return { unavailable: `robots.txt returned HTTP ${res.status}` };
      return { rules: parseRobots(await res.text(), productToken) };
    } catch (cause) {
      return {
        unavailable: `robots.txt could not be fetched: ${cause instanceof Error ? cause.message : String(cause)}`,
      };
    }
  }

  return {
    check: async (url) => {
      let entry = cache.get(url.origin);
      if (!entry || entry.expiresAt <= now()) {
        const value = await load(url.origin);
        entry = { value, expiresAt: now() + ('rules' in value ? okTtlMs : failTtlMs) };
        cache.set(url.origin, entry);
      }
      const { value } = entry;
      if ('unavailable' in value)
        return { allowed: false, crawlDelayMs: null, reason: value.unavailable };
      const allowed = value.rules.isAllowed(`${url.pathname}${url.search}`);
      return {
        allowed,
        crawlDelayMs: value.rules.crawlDelayMs,
        reason: allowed ? null : `robots.txt disallows ${url.pathname}`,
      };
    },
  };
}
