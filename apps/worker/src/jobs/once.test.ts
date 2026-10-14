import { describe, expect, it } from 'vitest';
import { isDigestRunForToday, notifyExitCode } from './once.js';

const SUMMER = '30 11 * * *'; // 7:30 AM EDT
const WINTER = '30 12 * * *'; // 7:30 AM EST

describe('isDigestRunForToday', () => {
  it('in daylight time, picks the 11:30 UTC schedule', () => {
    const july = new Date('2026-07-15T11:30:00Z');
    expect(isDigestRunForToday(SUMMER, july)).toBe(true);
    expect(isDigestRunForToday(WINTER, new Date('2026-07-15T12:30:00Z'))).toBe(false);
  });

  it('in standard time, picks the 12:30 UTC schedule', () => {
    const january = new Date('2026-01-15T12:30:00Z');
    expect(isDigestRunForToday(WINTER, january)).toBe(true);
    expect(isDigestRunForToday(SUMMER, new Date('2026-01-15T11:30:00Z'))).toBe(false);
  });

  it('decides by the schedule that fired, so a run that starts late still sends', () => {
    // The 11:30 UTC run, started 50 minutes late (8:20 AM in Ann Arbor).
    expect(isDigestRunForToday(SUMMER, new Date('2026-07-15T12:20:00Z'))).toBe(true);
    // And the other schedule, on time, still stands down, so exactly one of the two sends.
    expect(isDigestRunForToday(WINTER, new Date('2026-07-15T12:30:00Z'))).toBe(false);
  });

  it('switches on the days the clocks change', () => {
    // US daylight time in 2026: begins Sunday March 8, ends Sunday November 1.
    expect(isDigestRunForToday(WINTER, new Date('2026-03-07T12:30:00Z'))).toBe(true);
    expect(isDigestRunForToday(SUMMER, new Date('2026-03-08T11:30:00Z'))).toBe(true);
    expect(isDigestRunForToday(WINTER, new Date('2026-03-08T12:30:00Z'))).toBe(false);
    expect(isDigestRunForToday(SUMMER, new Date('2026-10-31T11:30:00Z'))).toBe(true);
    expect(isDigestRunForToday(WINTER, new Date('2026-11-01T12:30:00Z'))).toBe(true);
    expect(isDigestRunForToday(SUMMER, new Date('2026-11-01T11:30:00Z'))).toBe(false);
  });

  it('always runs when started by hand, with no schedule', () => {
    expect(isDigestRunForToday(undefined, new Date('2026-07-15T03:00:00Z'))).toBe(true);
    expect(isDigestRunForToday('', new Date('2026-07-15T03:00:00Z'))).toBe(true);
  });

  it('refuses a schedule it cannot read a fixed time from', () => {
    expect(() => isDigestRunForToday('*/5 * * * *', new Date())).toThrow(/fixed UTC time/);
  });
});

describe('notifyExitCode', () => {
  it('succeeds when everything sent, or nothing was due', () => {
    expect(notifyExitCode({ sent: 4, failed: 0 })).toBe(0);
    expect(notifyExitCode({ sent: 0, failed: 0 })).toBe(0);
  });

  it('logs rather than fails when only some recipients failed', () => {
    expect(notifyExitCode({ sent: 3, failed: 1 })).toBe(0);
  });

  it('fails when nothing due could be sent', () => {
    expect(notifyExitCode({ sent: 0, failed: 2 })).toBe(1);
  });
});
