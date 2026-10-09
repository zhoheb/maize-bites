import { createDb, loadRootEnvFile, sql } from '@maize-bites/db';
import { parseEnv } from './env.js';
import { authCleanupJob, pruneEventsJob } from './jobs/housekeeping.js';
import {
  deliveryFromEnv,
  digestJob,
  ingestDeps,
  ingestJob,
  llmDepsFromEnv,
  sourcesFromEnv,
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
const sources = sourcesFromEnv(db, env, console);
if (sources.length > 0) {
  const llm = llmDepsFromEnv(env);
  if (!llm)
    console.warn('[worker] ANTHROPIC_API_KEY is not set; the classifier will run rules only');
  console.info(`[worker] ingesting from: ${sources.map((s) => s.id).join(', ')}`);
  jobs.push(
    ingestJob(ingestDeps(db, sources, console, llm, { delivery, webOrigin: env.WEB_ORIGIN })),
  );
} else {
  console.warn(
    env.INGEST_CONTACT_EMAIL
      ? '[worker] every source is disabled (HAPPENING_ENABLED, MAIZEPAGES_ENABLED); ingestion is off'
      : '[worker] INGEST_CONTACT_EMAIL is not set; ingestion is disabled',
  );
}

const scheduler = startScheduler(jobs);
console.info(
  `[worker] scheduler started: ${jobs.map((j) => `${j.name} (${j.schedule})`).join(', ') || 'no jobs'}`,
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.info(`[worker] ${signal} received, shutting down`);
  try {
    await scheduler.stop();
    await close();
  } catch (error) {
    console.error('[worker] shutdown failed', error);
    process.exit(1);
  }
  process.exit(0);
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));
