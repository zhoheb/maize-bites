import { z } from 'zod';

const ROOT_ENV_FILE = new URL('../../../.env', import.meta.url);

/** Load the repo-root .env if present. Never overrides variables already set in the environment. */
export function loadRootEnvFile(): void {
  try {
    process.loadEnvFile(ROOT_ENV_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});
