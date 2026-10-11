// pnpm --filter worker digest:once
// Sends the morning digest once and exits: one message per digest subscriber with today's
// matching events they haven't been sent. Safe to run twice in a day (events are claimed before
// sending). Exits 1 if any delivery failed.
//
// From a scheduler set DIGEST_CRON to the UTC cron expression that fired. The digest is
// scheduled at both UTC times that can be 7:30 AM in Ann Arbor, and this stands down on the one
// that isn't today's (see jobs/once.ts). Without DIGEST_CRON it always sends.
import { createDb, loadRootEnvFile } from '@maize-bites/db';
import { parseEnv } from '../env.js';
import { deliveryFromEnv } from '../jobs/index.js';
import { isDigestRunForToday } from '../jobs/once.js';
import { runDigest } from '../notify/notifier.js';

loadRootEnvFile();
const env = parseEnv(process.env);
const now = new Date();

if (!isDigestRunForToday(process.env['DIGEST_CRON'], now)) {
  console.info(
    `Not today's digest run: "${process.env['DIGEST_CRON'] ?? ''}" is not 7:30 AM in Ann Arbor at this time of year. Nothing sent.`,
  );
} else {
  const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 2 });
  try {
    const stats = await runDigest({
      db,
      logger: console,
      delivery: deliveryFromEnv(db, env, console),
      webOrigin: env.WEB_ORIGIN,
      now,
    });
    console.info(JSON.stringify(stats));
    if (stats.failed > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}
