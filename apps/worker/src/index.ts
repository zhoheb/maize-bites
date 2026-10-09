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
import { createPinoLogger, toJobLogger } from './logger.js';
import { startScheduler, type Job } from './scheduler.js';

loadRootEnvFile();
const env = parseEnv(process.env);
const logger = toJobLogger(createPinoLogger(env));

const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 2 });
await db.execute(sql`select 1`);
logger.info('[worker] connected to postgres');

const delivery = deliveryFromEnv(db, env, logger);
if (!env.RESEND_API_KEY)
  logger.warn('[worker] RESEND_API_KEY is not set; alert emails are printed to this log');
if (!env.VAPID_PRIVATE_KEY) logger.warn('[worker] VAPID keys are not set; push alerts will fail');

const jobs: Job[] = [
  digestJob(db, logger, delivery, env.WEB_ORIGIN),
  authCleanupJob(db, logger),
  pruneEventsJob(db, logger, {
    retentionDays: env.EVENT_RETENTION_DAYS,
    intervalMinutes: env.PRUNE_INTERVAL_MINUTES,
  }),
];
const sources = sourcesFromEnv(db, env, logger);
if (sources.length > 0) {
  const llm = llmDepsFromEnv(env);
  if (!llm)
    logger.warn('[worker] ANTHROPIC_API_KEY is not set; the classifier will run rules only');
  logger.info(`[worker] ingesting from: ${sources.map((s) => s.id).join(', ')}`);
  jobs.push(
    ingestJob(ingestDeps(db, sources, logger, llm, { delivery, webOrigin: env.WEB_ORIGIN })),
  );
} else {
  logger.warn(
    env.INGEST_CONTACT_EMAIL
      ? '[worker] every source is disabled (HAPPENING_ENABLED, MAIZEPAGES_ENABLED); ingestion is off'
      : '[worker] INGEST_CONTACT_EMAIL is not set; ingestion is disabled',
  );
}

const scheduler = startScheduler(jobs, { logger });
logger.info(
  `[worker] scheduler started: ${jobs.map((j) => `${j.name} (${j.schedule})`).join(', ') || 'no jobs'}`,
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info(`[worker] ${signal} received, shutting down`);
  try {
    await scheduler.stop();
    await close();
  } catch (error) {
    logger.error('[worker] shutdown failed', error);
    process.exit(1);
  }
  process.exit(0);
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));
