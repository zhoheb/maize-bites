import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    resolve: { conditions: ['@maize-bites/source', ...defaultServerConditions] },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
