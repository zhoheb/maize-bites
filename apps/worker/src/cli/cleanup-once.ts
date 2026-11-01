// pnpm --filter worker cleanup:once
// Housekeeping, once, then exits: deletes expired sessions and used or expired sign-in links,
// and events that ended more than EVENT_RETENTION_DAYS ago (with their classifications, reports
// and alert log rows); rolls finished days of page views into daily totals and deletes raw page
// views past 90 days and analytics salts from before yesterday. The same steps the long-running
// worker runs. A failure throws, which exits nonzero.
//
// ingest.yml runs this after every pass with WINDOW_CRON set to the schedule that fired. It
// stands down, without touching the database, on all but the daily housekeeping window (see
// jobs/schedule.ts). Without WINDOW_CRON it always runs.
import { createDb, loadRootEnvFile } from '@maize-bites/db';
import { parseEnv } from '../env.js';
import { housekeepingSteps } from '../jobs/housekeeping.js';
import { isHousekeepingRun } from '../jobs/schedule.js';

loadRootEnvFile();
const env = parseEnv(process.env);

if (!isHousekeepingRun(process.env['WINDOW_CRON'], new Date())) {
  console.info('Not the housekeeping window. Nothing done.');
} else {
  const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 1 });
  try {
    for (const step of housekeepingSteps(db, console, {
      retentionDays: env.EVENT_RETENTION_DAYS,
    }))
      await step.run();
  } finally {
    await close();
  }
}
