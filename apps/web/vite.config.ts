import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const ROOT_DIR = '../..';

/**
 * Preloads the Latin subset of both self-hosted fonts in the built index.html, so text paints
 * in its real face without a swap. Their file names are hashed, so this reads them from the
 * bundle. (In dev there is no bundle and nothing is added.)
 */
function preloadFonts(): Plugin {
  return {
    name: 'maize-bites:preload-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        return Object.keys(bundle ?? {})
          .filter((file) => /-latin-wght-normal-[\w-]+\.woff2$/.test(file))
          .map((file) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `/${file}`,
              crossorigin: '',
            },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  // Only used to find the API in dev. Client code sees VITE_* vars only.
  const { API_PORT = '3001' } = loadEnv(mode, ROOT_DIR, 'API_');

  return {
    plugins: [
      react(),
      tailwindcss(),
      preloadFonts(),
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
          theme_color: '#0b1f3a',
          background_color: '#0b1f3a',
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
        injectManifest: {
          // The shell, plus the two Latin font files so the installed app opens offline in its
          // own type. Other scripts' subsets load on demand.
          globPatterns: [
            '**/*.{js,css,html,svg,png,webmanifest}',
            '**/*-latin-wght-normal-*.woff2',
          ],
        },
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
