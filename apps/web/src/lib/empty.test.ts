import { describe, expect, it } from 'vitest';
import { emptyCopy } from './empty';

// Ann Arbor is UTC−4 in October.
const at = (hourLocal: number) => new Date(Date.UTC(2026, 9, 1, hourLocal + 4, 0));

describe('emptyCopy', () => {
  it('points the Now tab at later today, with a hint for the time of day', () => {
    expect(emptyCopy('now', at(9))).toEqual({
      title: 'Quiet right now.',
      hint: 'Lunch usually picks up around 11:30.',
      next: { tab: 'today', label: 'See today' },
    });
    expect(emptyCopy('now', at(14)).hint).toMatch(/around 5/);
    expect(emptyCopy('now', at(22)).hint).toMatch(/late/);
  });

  it('points Today at the week, and the week at alerts only', () => {
    expect(emptyCopy('today', at(20)).next).toEqual({ tab: 'week', label: 'See this week' });
    expect(emptyCopy('week', at(12)).next).toBeNull();
  });
});
