import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './pool.js';

describe('mapWithConcurrency', () => {
  it('never runs more than `limit` at once and keeps result order', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 1, 4, 2, 3, 1, 2], 3, async (ms, i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight -= 1;
      return i;
    });
    expect(peak).toBe(3);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('handles fewer items than the limit, and none', async () => {
    expect(await mapWithConcurrency([1], 3, (x) => Promise.resolve(x * 2))).toEqual([2]);
    expect(await mapWithConcurrency([], 3, (x: number) => Promise.resolve(x))).toEqual([]);
  });

  it('rejects a bad limit', async () => {
    await expect(mapWithConcurrency([1], 0, (x) => Promise.resolve(x))).rejects.toThrow(
      /positive integer/,
    );
  });
});
