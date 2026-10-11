// pnpm --filter worker cleanup:once
// Housekeeping, once, then exits: deletes expired sessions and used or expired sign-in links,
// and events that ended more than EVENT_RETENTION_DAYS ago (with their classifications, reports
// and alert log rows). The same two jobs the long-running worker schedules. A failure throws,
// which exits nonzero.
import { createDb, loadRootEnvFile } from '@maize-bites/db';
import { parseEnv } from '../env.js';
import { authCleanupJob, pruneEventsJob } from '../jobs/housekeeping.js';

loadRootEnvFile();
const env = parseEnv(process.env);

const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 1 });
try {
  await authCleanupJob(db, console).run();
  await pruneEventsJob(db, console, {
    retentionDays: env.EVENT_RETENTION_DAYS,
    intervalMinutes: env.PRUNE_INTERVAL_MINUTES,
  }).run();
} finally {
  await close();
}
