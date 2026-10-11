import { CAMPUS_TIME_ZONE, effectiveEnd, type FoodEvent } from '@maize-bites/shared';
import { formatDuration } from './format';

// Where an event sits in time, which drives the whole hierarchy: the card's pill, the list
// group, and the map pin.

export type TimeStatus = 'now' | 'soon' | 'later' | 'ended';

/** "Starting soon" means within this long. */
export const SOON_MS = 2 * 60 * 60 * 1000;
/** A live event this close to its end is called out as ending soon. */
export const ENDING_SOON_MS = 15 * 60 * 1000;

const MINUTE = 60_000;

type Timed = Pick<FoodEvent, 'startsAt' | 'endsAt'>;

export function timeStatus(event: Timed, now: Date): TimeStatus {
  const start = new Date(event.startsAt).getTime();
  const t = now.getTime();
  if (t >= effectiveEnd(event).getTime()) return 'ended';
  if (t >= start) return 'now';
  return start - t <= SOON_MS ? 'soon' : 'later';
}

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAMPUS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});
const weekdayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'short',
});
const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** The campus calendar day, as "2026-10-12". */
export function localDayKey(date: Date): string {
  return dayKeyFormat.format(date);
}

/** Whole campus calendar days from `now` to `date` (0 today, 1 tomorrow). */
export function dayOffset(date: Date, now: Date): number {
  const a = Date.parse(`${localDayKey(date)}T00:00:00Z`);
  const b = Date.parse(`${localDayKey(now)}T00:00:00Z`);
  return Math.round((a - b) / DAY_MS);
}

/** "Today", "Tomorrow", then the weekday within a week, else "Mon, Oct 19". */
export function dayLabel(date: Date, now: Date): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset > 1 && offset < 7) return weekdayFormat.format(date);
  return dateFormat.format(date);
}

export interface StatusPill {
  status: TimeStatus;
  /** A live event in its last minutes. */
  endingSoon: boolean;
  text: string;
}

/**
 * The pill at the top of a card: "Happening now · ends in 25 min", "Starts in 40 min",
 * "Today 5:30 PM", "Ended".
 */
export function statusPill(event: Timed, now: Date): StatusPill {
  const status = timeStatus(event, now);
  const start = new Date(event.startsAt);
  const t = now.getTime();
  switch (status) {
    case 'now': {
      const left = effectiveEnd(event).getTime() - t;
      const endingSoon = left <= ENDING_SOON_MS;
      const text =
        left < MINUTE
          ? 'Ending now'
          : endingSoon
            ? `Ending soon · ${formatDuration(left)} left`
            : `Happening now · ends in ${formatDuration(left)}`;
      return { status, endingSoon, text };
    }
    case 'soon': {
      const wait = start.getTime() - t;
      return {
        status,
        endingSoon: false,
        text: wait < MINUTE ? 'Starting now' : `Starts in ${formatDuration(wait)}`,
      };
    }
    case 'later':
      return {
        status,
        endingSoon: false,
        text: `${dayLabel(start, now)} ${timeFormat.format(start)}`,
      };
    case 'ended':
      return { status, endingSoon: false, text: 'Ended' };
  }
}

/** "5:30 – 7:00 PM", or "5:30 PM" when the listing gives no end. */
export function formatClockRange(event: Timed): string {
  const start = timeFormat.format(new Date(event.startsAt));
  if (event.endsAt === null) return start;
  const end = timeFormat.format(new Date(event.endsAt));
  // Drop the first AM/PM when both share it: "5:30 – 7:00 PM".
  const [startClock, startPeriod] = start.split(/\s/);
  const endPeriod = end.split(/\s/)[1];
  return startPeriod === endPeriod && startClock ? `${startClock} – ${end}` : `${start} – ${end}`;
}

export { dateFormat as campusDateFormat };
