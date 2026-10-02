// pnpm --filter worker ingest:once
// One ingestion pass, subject to the same at-most-hourly guard as the scheduled job.
import { createDb, loadRootEnvFile } from '@maize-bites/db';
import { parseEnv } from '../env.js';
import { ingestIfDue } from '../jobs/ingest-happening.js';
import { deliveryFromEnv, happeningIngestDeps, llmDepsFromEnv } from '../jobs/index.js';

loadRootEnvFile();
const env = parseEnv(process.env);
if (!env.INGEST_CONTACT_EMAIL) {
  console.error(
    'INGEST_CONTACT_EMAIL must be set (it goes in the feed User-Agent). Add it to .env.',
  );
  process.exit(2);
}

const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 2 });
try {
  const outcome = await ingestIfDue(
    happeningIngestDeps(db, env.INGEST_CONTACT_EMAIL, console, llmDepsFromEnv(env), {
      delivery: deliveryFromEnv(db, env, console),
      webOrigin: env.WEB_ORIGIN,
    }),
  );
  if (outcome.status === 'skipped') {
    console.info(`Not due yet; next run allowed at ${outcome.nextAllowedAt.toISOString()}.`);
  } else {
    console.info(JSON.stringify(outcome.result, null, 2));
    if (!outcome.result.complete) process.exitCode = 1;
  }
} finally {
  await close();
}
