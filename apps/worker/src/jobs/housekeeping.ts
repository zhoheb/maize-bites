import {
  countPageViews,
  deleteExpiredAuthRows,
  deleteExpiredSalts,
  deleteOldPageViews,
  pruneEndedEvents,
  rollUpPageViews,
  type Database,
} from '@maize-bites/db';
import { localDateOf } from '@maize-bites/shared';
import { everyMinutesCron, type Job, type Logger } from '../scheduler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily at 4:17 AM Ann Arbor time: drop expired sessions and used or expired sign-in links. */
export function authCleanupJob(db: Database, logger: Logger, now = () => new Date()): Job {
  return {
    name: 'auth-cleanup',
    schedule: '17 4 * * *',
    run: async () => {
      const deleted = await deleteExpiredAuthRows(db, now());
      logger.info(`[auth-cleanup] deleted ${deleted} expired session(s) and sign-in link(s)`);
      return deleted;
    },
  };
}

export interface PruneOptions {
  retentionDays: number;
  intervalMinutes: number;
}

/** Every `intervalMinutes`: delete events that ended more than `retentionDays` ago. */
export function pruneEventsJob(
  db: Database,
  logger: Logger,
  { retentionDays, intervalMinutes }: PruneOptions,
  now = () => new Date(),
): Job {
  return {
    name: 'prune-events',
    schedule: everyMinutesCron(intervalMinutes),
    run: async () => {
      const cutoff = new Date(now().getTime() - retentionDays * DAY_MS);
      const deleted = await pruneEndedEvents(db, cutoff);
      logger.info(`[prune] deleted ${deleted} event(s) that ended before ${cutoff.toISOString()}`);
      return deleted;
    },
  };
}

/**
 * Daily at 4:37 AM Ann Arbor time: roll finished days of page views into analytics_daily, then
 * delete raw page views past their retention and salts from before yesterday. Rolling up first
 * means no day is deleted before its totals are kept.
 */
export function analyticsRollupJob(db: Database, logger: Logger, now = () => new Date()): Job {
  return {
    name: 'analytics-rollup',
    schedule: '37 4 * * *',
    run: async () => {
      const today = localDateOf(now());
      const rolled = await rollUpPageViews(db, today);
      const deletedViews = await deleteOldPageViews(db, today);
      const deletedSalts = await deleteExpiredSalts(db, today);
      const stored = await countPageViews(db);
      logger.info(
        `[analytics] rolled up ${rolled.length} day(s), deleted ${deletedViews} old page view(s) and ${deletedSalts} salt(s); ${stored} raw page view(s) stored`,
      );
      return rolled.length;
    },
  };
}
