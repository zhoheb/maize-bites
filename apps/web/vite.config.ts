import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const ROOT_DIR = '../..';

export default defineConfig(({ mode }) => {
  // Only used to find the API in dev. Client code sees VITE_* vars only.
  const { API_PORT = '3001' } = loadEnv(mode, ROOT_DIR, 'API_');

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src/sw',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: false, // registered in main.tsx
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Maize Bites',
          short_name: 'Maize Bites',
          description: 'Free food on the University of Michigan campus, right now.',
          theme_color: '#00274c',
          background_color: '#00274c',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          categories: ['food', 'education', 'lifestyle'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
      }),
    ],
    // MapLibre's worker is an ES module.
    worker: { format: 'es' },
    envDir: ROOT_DIR,
    resolve: {
      conditions: ['@maize-bites/source', ...defaultClientConditions],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // The API serves everything under /api, so paths pass through unchanged.
        '/api': { target: `http://localhost:${API_PORT}` },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
    },
  };
});
