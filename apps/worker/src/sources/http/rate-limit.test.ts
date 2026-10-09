import { describe, expect, it, vi } from 'vitest';
import { createHostRateLimiter } from './rate-limit.js';

function harness(minGapMs?: number) {
  let clock = 1_000_000;
  const sleep = vi.fn((ms: number) => {
    clock += ms;
    return Promise.resolve();
  });
  const limiter = createHostRateLimiter({
    ...(minGapMs === undefined ? {} : { minGapMs }),
    sleep,
    now: () => clock,
  });
  return { limiter, sleep, advance: (ms: number) => (clock += ms) };
}

describe('createHostRateLimiter', () => {
  it('lets the first request through and spaces the next by the default second', async () => {
    const { limiter, sleep } = harness();
    await limiter.wait('a.example');
    expect(sleep).not.toHaveBeenCalled();
    await limiter.wait('a.example');
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000);
  });

  it('only waits for what is left of the gap', async () => {
    const { limiter, sleep, advance } = harness();
    await limiter.wait('a.example');
    advance(400);
    await limiter.wait('a.example');
    expect(sleep).toHaveBeenCalledExactlyOnceWith(600);
    advance(5_000);
    await limiter.wait('a.example');
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('tracks hosts separately', async () => {
    const { limiter, sleep } = harness();
    await limiter.wait('a.example');
    await limiter.wait('b.example');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('honors a longer Crawl-delay but never goes below the default gap', async () => {
    const { limiter, sleep } = harness(1_000);
    await limiter.wait('a.example', 10_000);
    await limiter.wait('a.example', 10_000);
    expect(sleep).toHaveBeenLastCalledWith(10_000);
    await limiter.wait('a.example', 5);
    expect(sleep).toHaveBeenLastCalledWith(10_000);
    await limiter.wait('a.example', null);
    expect(sleep).toHaveBeenLastCalledWith(1_000);
  });
});
