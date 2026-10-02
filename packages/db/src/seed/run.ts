import { createDb } from '../client.js';
import { databaseEnvSchema, loadRootEnvFile } from '../env.js';
import { seedBuildings } from './seed-buildings.js';

loadRootEnvFile();
const { DATABASE_URL } = databaseEnvSchema.parse(process.env);

const { db, close } = createDb(DATABASE_URL, { maxConnections: 1 });
try {
  const count = await seedBuildings(db);
  console.log(`[seed] upserted ${count} buildings`);
} finally {
  await close();
}
