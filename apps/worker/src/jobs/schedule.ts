import { CAMPUS_TIME_ZONE, wallTimeOf } from '@maize-bites/shared';
import { scheduledLocalTime } from './once.js';

// When jobs wake the database, on the Ann Arbor clock. Everything runs in one window so Neon
// wakes once for it: ingest, classify, alert, and housekeeping once a day. A separate job would
// be a separate wake-up, because the compute suspends after 5 idle minutes.
//
//   11 PM to 7 AM  every 3 hours: 11:05 PM, 2:05, 5:05 (which also carries housekeeping)
//   7:00 AM        one ingestion, so the 7:30 digest has fresh data
//   8 AM to 10 PM  hourly at :05
//
// The worker's scheduler keeps this clock directly. GitHub's cron is UTC, so ingest.yml lists
// the UTC times for both daylight and standard time, and isIngestRun drops whichever don't land
// on a window today. schedule.test.ts checks ingest.yml against this for a whole year.

/** The hours with a window at :05. 7 AM isn't one: it has its own run at 7:00. */
export const WINDOW_LOCAL_HOURS: readonly number[] = [
  2, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
];
export const WINDOW_MINUTE = 5;
export const MORNING_INGEST_LOCAL_TIME = { hour: 7, minute: 0 };
/** The quietest window, overnight. Housekeeping is daily and has no reason to wake Neon alone. */
export const HOUSEKEEPING_LOCAL_HOUR = 5;

/** For the worker's scheduler, which evaluates cron in America/Detroit. */
export const WINDOW_CRON = `${WINDOW_MINUTE} 2,5,8-23 * * *`;
export const MORNING_INGEST_CRON = `${MORNING_INGEST_LOCAL_TIME.minute} ${MORNING_INGEST_LOCAL_TIME.hour} * * *`;

const blank = (cron: string | undefined): cron is undefined | '' =>
  cron === undefined || cron.trim() === '';

/** Fixed-hour lines are the ones whose meaning depends on the season ("5 9 * * *"). */
const hasFixedHour = (cron: string) => /^\d+$/.test(cron.trim().split(/\s+/)[1] ?? '');

function isWindow({ hour, minute }: { hour: number; minute: number }): boolean {
  if (hour === MORNING_INGEST_LOCAL_TIME.hour) return minute === MORNING_INGEST_LOCAL_TIME.minute;
  return minute === WINDOW_MINUTE && WINDOW_LOCAL_HOURS.includes(hour);
}

/**
 * Whether a scheduled ingest run lands on a window today. Like the digest, this reads the
 * schedule that fired rather than the clock, because GitHub starts runs hours late. A line
 * with an hour range holds only UTC hours that are windows all year, so it is always yes, as is
 * a manual run (no `cron`). Decides without the database, so a stand-down wakes nothing.
 */
export function isIngestRun(cron: string | undefined, now: Date): boolean {
  if (blank(cron) || !hasFixedHour(cron)) return true;
  return isWindow(scheduledLocalTime(cron, now));
}

/** Whether this run is the day's housekeeping window. A manual run (no `cron`) always is. */
export function isHousekeepingRun(cron: string | undefined, now: Date): boolean {
  if (blank(cron)) return true;
  if (!hasFixedHour(cron)) return false;
  const local = scheduledLocalTime(cron, now);
  return local.hour === HOUSEKEEPING_LOCAL_HOUR && local.minute === WINDOW_MINUTE;
}

/** Whether `now` falls in Ann Arbor's housekeeping hour, for the scheduler, which runs on time. */
export function isHousekeepingHour(now: Date): boolean {
  return wallTimeOf(now.getTime(), CAMPUS_TIME_ZONE).hour === HOUSEKEEPING_LOCAL_HOUR;
}
