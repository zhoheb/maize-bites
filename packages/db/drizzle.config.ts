import { defineConfig } from 'drizzle-kit';
import { z } from 'zod';

try {
  // drizzle-kit runs with cwd = packages/db
  process.loadEnvFile('../../.env');
} catch {
  // No .env file: fall back to the real environment.
}

const env = z.object({ DATABASE_URL: z.url() }).parse(process.env);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
  verbose: true,
});
