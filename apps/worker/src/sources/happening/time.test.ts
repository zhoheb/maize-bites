import { describe, expect, it } from 'vitest';
import { localDate, parseFeedDateTime } from './time.js';

const TZ = 'America/Detroit';

describe('parseFeedDateTime', () => {
  it('converts EDT wall-clock time (UTC-4)', () => {
    expect(parseFeedDateTime('20260923T100000', TZ).toISOString()).toBe('2026-09-23T14:00:00.000Z');
  });

  it('converts EST wall-clock time (UTC-5)', () => {
    expect(parseFeedDateTime('20261215T183000', TZ).toISOString()).toBe('2026-12-15T23:30:00.000Z');
  });

  it('handles times right after the fall-back and spring-forward transitions', () => {
    // 2026-11-01: 2am EDT → 1am EST. 3am local is EST.
    expect(parseFeedDateTime('20261101T030000', TZ).toISOString()).toBe('2026-11-01T08:00:00.000Z');
    // 2026-03-08: 2am EST → 3am EDT. 3am local is EDT.
    expect(parseFeedDateTime('20260308T030000', TZ).toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  it.each(['2026-09-23T10:00:00', '20260923', '', '20260923T1000'])('rejects %j', (value) => {
    expect(() => parseFeedDateTime(value, TZ)).toThrow(/Malformed/);
  });

  it('rejects unknown time zones', () => {
    expect(() => parseFeedDateTime('20260923T100000', 'Mars/Olympus_Mons')).toThrow(RangeError);
  });
});

describe('localDate', () => {
  it('uses the local calendar day, not UTC', () => {
    // 11:30pm EDT on Sep 30 is already Oct 1 in UTC.
    expect(localDate(new Date('2026-10-01T03:30:00Z'), TZ)).toBe('2026-09-30');
  });
});
