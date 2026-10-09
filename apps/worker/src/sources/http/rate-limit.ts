export interface HostRateLimiter {
  /** Resolves once a request to `host` is allowed, keeping at least `minGapMs` since the last one. */
  wait: (host: string, minGapMs?: number | null) => Promise<void>;
}

/** Spaces out requests per host. Each call reserves the next slot, so callers queue in order. */
export function createHostRateLimiter(
  options: {
    /** Default gap between requests to one host. A larger robots.txt Crawl-delay wins. */
    minGapMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): HostRateLimiter {
  const {
    minGapMs: defaultGapMs = 1_000,
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  } = options;
  const nextAllowedAt = new Map<string, number>();

  return {
    wait: async (host, minGapMs) => {
      const gap = Math.max(defaultGapMs, minGapMs ?? 0);
      const at = Math.max(now(), nextAllowedAt.get(host) ?? 0);
      nextAllowedAt.set(host, at + gap);
      const delay = at - now();
      if (delay > 0) await sleep(delay);
    },
  };
}
