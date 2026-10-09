// pnpm --filter worker ingest:once
// One ingestion pass over the enabled sources, subject to the same per-source guard as the
// scheduled job. To run a single source: HAPPENING_ENABLED=false MAIZEPAGES_ENABLED=true pnpm ingest:once
import { createDb, loadRootEnvFile } from '@maize-bites/db';
import { parseEnv } from '../env.js';
import { ingestIfDue } from '../jobs/ingest.js';
import { deliveryFromEnv, ingestDeps, llmDepsFromEnv, sourcesFromEnv } from '../jobs/index.js';

loadRootEnvFile();
const env = parseEnv(process.env);
if (!env.INGEST_CONTACT_EMAIL) {
  console.error('INGEST_CONTACT_EMAIL must be set (it goes in the User-Agent). Add it to .env.');
  process.exit(2);
}

const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 2 });
try {
  const sources = sourcesFromEnv(db, env, console);
  if (sources.length === 0) {
    console.error('Every source is disabled. Set HAPPENING_ENABLED or MAIZEPAGES_ENABLED to true.');
    process.exitCode = 2;
  } else {
    const outcome = await ingestIfDue(
      ingestDeps(db, sources, console, llmDepsFromEnv(env), {
        delivery: deliveryFromEnv(db, env, console),
        webOrigin: env.WEB_ORIGIN,
      }),
    );
    if (outcome.status === 'skipped') {
      console.info(`Not due yet; next run allowed at ${outcome.nextAllowedAt.toISOString()}.`);
    } else {
      console.info(JSON.stringify(outcome, null, 2));
      if (outcome.results.some((result) => !result.complete)) process.exitCode = 1;
    }
  }
} finally {
  await close();
}
