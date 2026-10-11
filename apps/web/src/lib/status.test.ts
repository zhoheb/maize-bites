import { describe, expect, it } from 'vitest';
import { makeEvent } from '../test/fixtures';
import {
  CLOSING_FRACTION,
  dayLabel,
  dayOffset,
  formatClockRange,
  isUrgent,
  progress,
  railTime,
  statusPhrase,
  statusPill,
  timeStatus,
} from './status';

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
      text: 'Today 12:00 PM',
      countdown: null,
    });
    expect(pill('2026-09-30T20:00:00Z').text).toBe('Tomorrow 12:00 PM');
    expect(pill('2026-09-28T20:00:00Z').text).toBe('Thu 12:00 PM');
    expect(pill('2026-09-20T20:00:00Z').text).toBe('Thu, Oct 1 12:00 PM');
  });

  it('counts down to a start within two hours', () => {
    expect(pill('2026-10-01T15:20:00Z')).toEqual({
      status: 'soon',
      text: 'Starts in 40 min',
      countdown: null,
    });
    expect(pill('2026-10-01T14:30:00Z').text).toBe('Starts in 1 hr 30 min');
    expect(pill('2026-10-01T15:59:30Z').text).toBe('Starting now');
  });

  it('says a live event is happening now, with the time left as a separate part', () => {
    expect(pill('2026-10-01T17:05:00Z')).toEqual({
      status: 'now',
      text: 'Happening now',
      countdown: 'ends in 25 min',
    });
    expect(pill('2026-10-01T17:29:30Z').countdown).toBe('ending now');
  });

  it('says ended once it is over', () => {
    expect(pill('2026-10-01T18:00:00Z')).toEqual({
      status: 'ended',
      text: 'Ended',
      countdown: null,
    });
  });

  it('joins the two parts into one phrase for pin labels', () => {
    expect(statusPhrase(event, at('2026-10-01T17:05:00Z'))).toBe('Happening now, ends in 25 min');
    expect(statusPhrase(event, at('2026-10-01T15:20:00Z'))).toBe('Starts in 40 min');
  });
});

describe('isUrgent', () => {
  it('is true while live and in the half hour before the start, and not otherwise', () => {
    expect(isUrgent(event, at('2026-10-01T15:29:00Z'))).toBe(false); // 31 min before
    expect(isUrgent(event, at('2026-10-01T15:30:00Z'))).toBe(true); // 30 min before
    expect(isUrgent(event, at('2026-10-01T16:45:00Z'))).toBe(true); // live
    expect(isUrgent(event, at('2026-10-01T17:30:00Z'))).toBe(false); // over
  });
});

describe('progress', () => {
  it('runs from 0 at the start to 1 at the end, and stays in range outside it', () => {
    expect(progress(event, at('2026-10-01T15:00:00Z'))).toBe(0);
    expect(progress(event, at('2026-10-01T16:00:00Z'))).toBe(0);
    expect(progress(event, at('2026-10-01T16:45:00Z'))).toBe(0.5);
    expect(progress(event, at('2026-10-01T17:30:00Z'))).toBe(1);
    expect(progress(event, at('2026-10-01T19:00:00Z'))).toBe(1);
  });

  it('reaches the closing stretch in the last fifth', () => {
    expect(progress(event, at('2026-10-01T17:11:00Z'))).toBeLessThan(CLOSING_FRACTION);
    expect(progress(event, at('2026-10-01T17:13:00Z'))).toBeGreaterThanOrEqual(CLOSING_FRACTION);
  });

  it('measures an event with no end against its assumed hour', () => {
    expect(progress(makeEvent({ endsAt: null }), at('2026-10-01T16:30:00Z'))).toBe(0.5);
  });
});

describe('railTime', () => {
  it('splits the start into clock and period, and gives the end as a bare clock', () => {
    expect(railTime(event)).toEqual({ clock: '12:00', period: 'PM', end: '1:30' });
    expect(railTime(makeEvent({ endsAt: null }))).toEqual({
      clock: '12:00',
      period: 'PM',
      end: null,
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
