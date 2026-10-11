import { CAMPUS_TIME_ZONE, effectiveEnd, type FoodEvent } from '@maize-bites/shared';
import { formatDuration } from './format';

// Where an event sits in time, which drives the whole hierarchy: the card's pill, the list
// group, and the map pin.

export type TimeStatus = 'now' | 'soon' | 'later' | 'ended';

/** "Starting soon" means within this long. */
export const SOON_MS = 2 * 60 * 60 * 1000;
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
  /** "Happening now", "Starts in 40 min", "Today 5:30 PM", "Ended". */
  text: string;
  /** For a live event, how long is left: "ends in 25 min". Null otherwise. */
  countdown: string | null;
}

/** The status label for an event, and for a live one the time left. */
export function statusPill(event: Timed, now: Date): StatusPill {
  const status = timeStatus(event, now);
  const start = new Date(event.startsAt);
  const t = now.getTime();
  switch (status) {
    case 'now': {
      const left = effectiveEnd(event).getTime() - t;
      return {
        status,
        text: 'Happening now',
        countdown: left < MINUTE ? 'ending now' : `ends in ${formatDuration(left)}`,
      };
    }
    case 'soon': {
      const wait = start.getTime() - t;
      return {
        status,
        text: wait < MINUTE ? 'Starting now' : `Starts in ${formatDuration(wait)}`,
        countdown: null,
      };
    }
    case 'later':
      return {
        status,
        text: `${dayLabel(start, now)} ${timeFormat.format(start)}`,
        countdown: null,
      };
    case 'ended':
      return { status, text: 'Ended', countdown: null };
  }
}

/** The status in one phrase, for places with no room for two parts (pin labels). */
export function statusPhrase(event: Timed, now: Date): string {
  const { text, countdown } = statusPill(event, now);
  return countdown ? `${text}, ${countdown}` : text;
}

/** Events live now, or starting within this long, get the prominent card. */
export const URGENT_SOON_MS = 30 * 60 * 1000;

/** True for the events that should stand out: happening now, or about to start. */
export function isUrgent(event: Timed, now: Date): boolean {
  const status = timeStatus(event, now);
  if (status === 'now') return true;
  return status === 'soon' && new Date(event.startsAt).getTime() - now.getTime() <= URGENT_SOON_MS;
}

/** From this fraction of the way through, a live event is in its closing stretch. */
export const CLOSING_FRACTION = 0.8;

/** How far through an event we are, from 0 (not started) to 1 (over). */
export function progress(event: Timed, now: Date): number {
  const start = new Date(event.startsAt).getTime();
  const end = effectiveEnd(event).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export interface RailTime {
  /** "5:30" */
  clock: string;
  /** "PM" */
  period: string;
  /** The end as a bare clock time, "7:00", or null when the listing gives none. */
  end: string | null;
}

const split = (date: Date): [string, string] => {
  const [clock = '', period = ''] = timeFormat.format(date).split(/\s/);
  return [clock, period];
};

/** An event's times in the pieces the agenda's time rail sets in different sizes. */
export function railTime(event: Timed): RailTime {
  const [clock, period] = split(new Date(event.startsAt));
  return {
    clock,
    period,
    end: event.endsAt === null ? null : split(new Date(event.endsAt))[0],
  };
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
