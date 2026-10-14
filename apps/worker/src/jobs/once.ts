import { CAMPUS_TIME_ZONE, wallTimeOf } from '@maize-bites/shared';
import type { NotifyStats } from '../notify/notifier.js';

// Helpers for running jobs one at a time from a scheduler outside the process (GitHub Actions),
// where there is no long-running worker to hold a cron.

/** The digest's local send time. */
export const DIGEST_LOCAL_TIME = { hour: 7, minute: 30 };

/**
 * Whether a scheduled digest run is the one meant for today.
 *
 * GitHub's cron is in UTC, and 7:30 AM in Ann Arbor is 11:30 UTC in summer and 12:30 UTC in
 * winter, so the workflow is scheduled at both and each run asks here whether it is the right
 * one. The answer comes from the schedule that fired (`cron`), not from the clock: scheduled
 * runs often start many minutes late, and a clock check would then skip the digest entirely.
 *
 * `cron` is the expression that triggered the run ("30 11 * * *"). With none (a manual run),
 * the answer is yes.
 */
export function isDigestRunForToday(cron: string | undefined, now: Date): boolean {
  if (cron === undefined || cron.trim() === '') return true;
  const [minuteField, hourField] = cron.trim().split(/\s+/);
  const minute = Number(minuteField);
  const hour = Number(hourField);
  if (!Number.isInteger(minute) || !Number.isInteger(hour))
    throw new Error(`Can't read a fixed UTC time from the schedule "${cron}"`);
  // The moment this schedule stands for on today's UTC date, seen on the campus clock.
  const scheduled = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    minute,
  );
  const local = wallTimeOf(scheduled, CAMPUS_TIME_ZONE);
  return local.hour === DIGEST_LOCAL_TIME.hour && local.minute === DIGEST_LOCAL_TIME.minute;
}

/**
 * Exit code for a one-shot notify run. A failure for some recipients while others got their
 * message is theirs (a dead device, a bounced address) and is only logged; nothing getting
 * through at all points at us (config, the provider, a bug) and fails the job. Errors that stop
 * the run outright (bad env, an unreachable database) throw and exit nonzero on their own.
 */
export function notifyExitCode(stats: Pick<NotifyStats, 'sent' | 'failed'>): 0 | 1 {
  return stats.failed > 0 && stats.sent === 0 ? 1 : 0;
}
