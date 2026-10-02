import { deleteExpiredAuthRows, pruneEndedEvents, type Database } from '@maize-bites/db';
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
