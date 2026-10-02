import { createDb, loadRootEnvFile, sql } from '@maize-bites/db';
import { parseEnv } from './env.js';
import { authCleanupJob, pruneEventsJob } from './jobs/housekeeping.js';
import {
  deliveryFromEnv,
  digestJob,
  happeningIngestDeps,
  happeningIngestJob,
  llmDepsFromEnv,
} from './jobs/index.js';
import { startScheduler, type Job } from './scheduler.js';

loadRootEnvFile();
const env = parseEnv(process.env);

const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 2 });
await db.execute(sql`select 1`);
console.info('[worker] connected to postgres');

const delivery = deliveryFromEnv(db, env, console);
if (!env.RESEND_API_KEY)
  console.warn('[worker] RESEND_API_KEY is not set; alert emails are printed to this log');
if (!env.VAPID_PRIVATE_KEY) console.warn('[worker] VAPID keys are not set; push alerts will fail');

const jobs: Job[] = [
  digestJob(db, console, delivery, env.WEB_ORIGIN),
  authCleanupJob(db, console),
  pruneEventsJob(db, console, {
    retentionDays: env.EVENT_RETENTION_DAYS,
    intervalMinutes: env.PRUNE_INTERVAL_MINUTES,
  }),
];
if (env.INGEST_CONTACT_EMAIL) {
  const llm = llmDepsFromEnv(env);
  if (!llm)
    console.warn('[worker] ANTHROPIC_API_KEY is not set; the classifier will run rules only');
  jobs.push(
    happeningIngestJob(
      happeningIngestDeps(db, env.INGEST_CONTACT_EMAIL, console, llm, {
        delivery,
        webOrigin: env.WEB_ORIGIN,
      }),
    ),
  );
} else {
  console.warn(
    '[worker] INGEST_CONTACT_EMAIL is not set; Happening @ Michigan ingestion is disabled',
  );
}

const scheduler = startScheduler(jobs);
console.info(
  `[worker] scheduler started: ${jobs.map((j) => `${j.name} (${j.schedule})`).join(', ') || 'no jobs'}`,
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.info(`[worker] ${signal} received, shutting down`);
  await scheduler.stop();
  await close();
  process.exit(0);
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));
