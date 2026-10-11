import { describe, expect, it } from 'vitest';
import { makeEvent } from '../test/fixtures';
import { dayLabel, dayOffset, formatClockRange, statusPill, timeStatus } from './status';

// Fixture: Oct 1 2026, 16:00–17:30 UTC, which is noon–1:30 PM in Ann Arbor (EDT, UTC−4).
const event = makeEvent();
const at = (iso: string) => new Date(iso);
const clean = (s: string) => s.replace(/\u202f/g, ' ');

describe('timeStatus', () => {
  it('orders an event through later, soon, now, ended', () => {
    expect(timeStatus(event, at('2026-10-01T13:59:00Z'))).toBe('later');
    expect(timeStatus(event, at('2026-10-01T14:00:00Z'))).toBe('soon'); // exactly 2 hours out
    expect(timeStatus(event, at('2026-10-01T15:59:59Z'))).toBe('soon');
    expect(timeStatus(event, at('2026-10-01T16:00:00Z'))).toBe('now');
    expect(timeStatus(event, at('2026-10-01T17:29:59Z'))).toBe('now');
    expect(timeStatus(event, at('2026-10-01T17:30:00Z'))).toBe('ended');
  });

  it('treats an event with no end as lasting an hour', () => {
    const open = makeEvent({ endsAt: null });
    expect(timeStatus(open, at('2026-10-01T16:59:00Z'))).toBe('now');
    expect(timeStatus(open, at('2026-10-01T17:00:00Z'))).toBe('ended');
  });
});

describe('statusPill', () => {
  const pill = (iso: string) => {
    const p = statusPill(event, at(iso));
    return { ...p, text: clean(p.text) };
  };

  it('says when a later event is, by day and campus time', () => {
    expect(pill('2026-10-01T12:00:00Z')).toEqual({
      status: 'later',
      endingSoon: false,
      text: 'Today 12:00 PM',
    });
    expect(pill('2026-09-30T20:00:00Z').text).toBe('Tomorrow 12:00 PM');
    expect(pill('2026-09-28T20:00:00Z').text).toBe('Thu 12:00 PM');
    expect(pill('2026-09-20T20:00:00Z').text).toBe('Thu, Oct 1 12:00 PM');
  });

  it('counts down to a start within two hours', () => {
    expect(pill('2026-10-01T15:20:00Z')).toMatchObject({
      status: 'soon',
      text: 'Starts in 40 min',
    });
    expect(pill('2026-10-01T14:30:00Z').text).toBe('Starts in 1 hr 30 min');
    expect(pill('2026-10-01T15:59:30Z').text).toBe('Starting now');
  });

  it('says a live event is happening now and when it ends', () => {
    expect(pill('2026-10-01T17:05:00Z')).toEqual({
      status: 'now',
      endingSoon: false,
      text: 'Happening now · ends in 25 min',
    });
  });

  it('calls out the last fifteen minutes', () => {
    expect(pill('2026-10-01T17:20:00Z')).toEqual({
      status: 'now',
      endingSoon: true,
      text: 'Ending soon · 10 min left',
    });
    expect(pill('2026-10-01T17:29:30Z').text).toBe('Ending now');
  });

  it('says ended once it is over', () => {
    expect(pill('2026-10-01T18:00:00Z')).toEqual({
      status: 'ended',
      endingSoon: false,
      text: 'Ended',
    });
  });
});

describe('campus days', () => {
  it('counts days by the Ann Arbor calendar, not UTC', () => {
    // 03:30 UTC on Oct 2 is still 11:30 PM on Oct 1 in Ann Arbor.
    const lateNight = at('2026-10-02T03:30:00Z');
    expect(dayOffset(lateNight, at('2026-10-01T16:00:00Z'))).toBe(0);
    expect(dayLabel(lateNight, at('2026-10-01T16:00:00Z'))).toBe('Today');
    expect(dayOffset(at('2026-10-02T04:30:00Z'), at('2026-10-01T16:00:00Z'))).toBe(1);
  });
});

describe('formatClockRange', () => {
  it('drops the repeated AM/PM, keeps both when they differ, and handles no end', () => {
    expect(clean(formatClockRange(event))).toBe('12:00 – 1:30 PM');
    expect(
      clean(
        formatClockRange(
          makeEvent({ startsAt: '2026-10-01T15:00:00Z', endsAt: '2026-10-01T17:00:00Z' }),
        ),
      ),
    ).toBe('11:00 AM – 1:00 PM');
    expect(clean(formatClockRange(makeEvent({ endsAt: null })))).toBe('12:00 PM');
  });
});
