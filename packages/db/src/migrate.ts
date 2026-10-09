// node dist/migrate.js
// Applies pending migrations in production, where drizzle-kit (a dev dependency) isn't
// installed. Uses the same migration files and bookkeeping table as `pnpm db:migrate`.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { databaseEnvSchema, loadRootEnvFile } from './env.js';

loadRootEnvFile();
const { DATABASE_URL } = databaseEnvSchema.parse(process.env);
const client = postgres(DATABASE_URL, { max: 1, onnotice: () => undefined });
try {
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
  console.log('[migrate] migrations are up to date');
} finally {
  await client.end();
}
