// pnpm db:seed:demo            insert or refresh the demo events
// pnpm db:seed:demo --clear    remove them
// Development only: refuses to run with NODE_ENV=production or against a non-local database.
import { createDb } from '../client.js';
import { databaseEnvSchema, loadRootEnvFile } from '../env.js';
import { assertDemoSeedAllowed, clearDemoEvents, seedDemoEvents } from './demo.js';

loadRootEnvFile();
const { DATABASE_URL } = databaseEnvSchema.parse(process.env);
try {
  assertDemoSeedAllowed({ NODE_ENV: process.env['NODE_ENV'], DATABASE_URL });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { db, close } = createDb(DATABASE_URL, { maxConnections: 1 });
try {
  if (process.argv.includes('--clear')) {
    console.log(`[seed:demo] removed ${await clearDemoEvents(db)} demo events`);
  } else {
    const count = await seedDemoEvents(db);
    console.log(
      `[seed:demo] wrote ${count} demo events (titles start with "[demo]"). Remove them with: pnpm db:seed:demo --clear`,
    );
  }
} finally {
  await close();
}
