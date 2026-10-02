import { describe, expect, it } from 'vitest';
import { CAMPUS_TIME_ZONE as TZ, startOfNextLocalDay, wallTimeOf, wallTimeToUtc } from './time.js';

describe('wallTimeToUtc', () => {
  it('handles EDT and EST', () => {
    expect(wallTimeToUtc({ year: 2026, month: 9, day: 23, hour: 10 }, TZ).toISOString()).toBe(
      '2026-09-23T14:00:00.000Z',
    );
    expect(
      wallTimeToUtc({ year: 2026, month: 12, day: 15, hour: 18, minute: 30 }, TZ).toISOString(),
    ).toBe('2026-12-15T23:30:00.000Z');
  });

  it('handles times right after DST transitions', () => {
    expect(wallTimeToUtc({ year: 2026, month: 11, day: 1, hour: 3 }, TZ).toISOString()).toBe(
      '2026-11-01T08:00:00.000Z',
    );
    expect(wallTimeToUtc({ year: 2026, month: 3, day: 8, hour: 3 }, TZ).toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    );
  });

  it('rejects unknown zones', () => {
    expect(() => wallTimeToUtc({ year: 2026, month: 1, day: 1 }, 'Mars/Base')).toThrow(RangeError);
  });
});

describe('wallTimeOf', () => {
  it('reads local fields', () => {
    expect(wallTimeOf(new Date('2026-10-01T03:30:00Z'), TZ)).toEqual({
      year: 2026,
      month: 9,
      day: 30,
      hour: 23,
      minute: 30,
      second: 0,
    });
  });
});

describe('startOfNextLocalDay', () => {
  it('returns the next local midnight', () => {
    expect(startOfNextLocalDay(new Date('2026-10-01T16:00:00Z')).toISOString()).toBe(
      '2026-10-02T04:00:00.000Z',
    );
  });

  it('uses the local day, not the UTC day, late in the evening', () => {
    // 11:30pm Sep 30 local is already Oct 1 in UTC.
    expect(startOfNextLocalDay(new Date('2026-10-01T03:30:00Z')).toISOString()).toBe(
      '2026-10-01T04:00:00.000Z',
    );
  });

  it('rolls over months and handles the fall-back day (25 hours long)', () => {
    expect(startOfNextLocalDay(new Date('2026-10-31T16:00:00Z')).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(startOfNextLocalDay(new Date('2026-11-01T16:00:00Z')).toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });
});
