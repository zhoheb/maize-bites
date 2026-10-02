import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    resolve: { conditions: ['@maize-bites/source', ...defaultServerConditions] },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Suites boot PGlite (or a real Postgres db) per test; allow for slow CI and parallel packages.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
