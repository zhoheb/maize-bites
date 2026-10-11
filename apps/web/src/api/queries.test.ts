import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './client';
import { WAKING_RETRIES, looksLikeWaking, retryDelay, shouldRetry } from './queries';

const http = (status: number) => new ApiRequestError(status, 'x', 'x', null);
const network = new TypeError('Failed to fetch');

/** How many times a failure is retried before giving up. */
function retries(error: unknown): number {
  let n = 0;
  while (shouldRetry(n, error)) n++;
  return n;
}

describe('retry policy', () => {
  it('never retries a client error', () => {
    expect(retries(http(400))).toBe(0);
    expect(retries(http(401))).toBe(0);
    expect(retries(http(404))).toBe(0);
    expect(retries(http(429))).toBe(0);
  });

  it('waits out a waking API: no response at all, or a gateway error from the proxy', () => {
    for (const error of [network, http(502), http(503), http(504)]) {
      expect(looksLikeWaking(error)).toBe(true);
      expect(retries(error)).toBe(WAKING_RETRIES);
    }
  });

  it('retries an ordinary server error or a malformed response once', () => {
    expect(looksLikeWaking(http(500))).toBe(false);
    expect(retries(http(500))).toBe(1);
    expect(retries(new Error('response did not match the schema'))).toBe(1);
  });

  it('backs off 2, 4, 8 seconds, then every 10, for over a minute in all', () => {
    const delays = Array.from({ length: WAKING_RETRIES }, (_, attempt) => retryDelay(attempt));
    expect(delays).toEqual([2000, 4000, 8000, 10_000, 10_000, 10_000, 10_000, 10_000]);
    // Render says a free service takes about a minute to spin up.
    expect(delays.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(60_000);
  });
});
