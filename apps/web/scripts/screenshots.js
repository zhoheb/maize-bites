// Captures the site for visual review, with Playwright and the Chromium already installed on
// this machine (it never downloads a browser): desktop, laptop and phone, light and dark, plus
// the detail drawer, the map's peek card, and the phone sheet at two heights.
//
//   pnpm --filter @maize-bites/web screenshots                       # into docs/screenshots/ui-v3
//   pnpm --filter @maize-bites/web screenshots --out some/dir --only desktop
//
// Needs the site running with demo events visible, so every state is on screen:
//   pnpm db:seed:demo && VITE_SHOW_DEMO=true pnpm dev
/* global document */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: '../../docs/screenshots/ui-v3' },
    base: { type: 'string', default: 'http://localhost:5173' },
    only: { type: 'string' },
  },
});
const outDir = resolve(values.out);
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];
const SCHEMES = ['light', 'dark'];

/** Resolves once the map has painted its tiles and placed its pins. */
async function mapSettled(page) {
  await page.waitForSelector('[data-map-idle="true"]', { timeout: 30_000 });
  await page.waitForSelector('.map-pin', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(700); // pin fade-in and any camera move
  await page.waitForSelector('[data-map-idle="true"]', { timeout: 30_000 });
}

async function open(page, path) {
  await page.goto(values.base + path, { waitUntil: 'domcontentloaded' });
  await page
    .waitForSelector('article, [data-empty-state], main h1', { timeout: 20_000 })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
}

/** Each shot: a name, which viewports it applies to, and how to get the page into that state. */
const SHOTS = [
  {
    name: 'week',
    run: async (page) => {
      await open(page, '/?tab=week');
      await mapSettled(page);
    },
  },
  {
    name: 'now',
    run: async (page) => {
      await open(page, '/');
      await mapSettled(page);
    },
  },
  {
    name: 'today',
    only: ['desktop'],
    run: async (page) => {
      await open(page, '/?tab=today');
      await mapSettled(page);
    },
  },
  {
    name: 'drawer',
    only: ['desktop', 'mobile'],
    run: async (page) => {
      await open(page, '/');
      // Open the first event the way its card does: by its link.
      const href = await page.locator('article a').first().getAttribute('href');
      await open(page, href);
      await page.waitForSelector('[role="dialog"] h2', { timeout: 10_000 });
      await mapSettled(page).catch(() => undefined);
      await page.waitForTimeout(1_200); // the drawer's own mini map
    },
  },
  {
    name: 'popover',
    only: ['desktop', 'laptop'],
    run: async (page) => {
      await open(page, '/');
      await mapSettled(page);
      await page.locator('.map-pin:not(.map-cluster)').first().click();
      await page.waitForSelector('.maplibregl-popup', { timeout: 10_000 });
      await mapSettled(page);
    },
  },
  {
    name: 'sheet-half',
    only: ['mobile'],
    run: async (page) => {
      await open(page, '/?tab=week');
      await mapSettled(page);
      await page.getByRole('button', { name: /^Resize event list/ }).click();
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'filters',
    only: ['desktop'],
    run: async (page) => {
      await open(page, '/?tab=week&campus=central,north&diet=vegetarian&open=1');
      await mapSettled(page);
      await page.getByRole('button', { name: /^Diet/ }).click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'about',
    only: ['desktop'],
    run: async (page) => {
      await open(page, '/about');
    },
  },
];

const browser = await chromium.launch({
  // Software WebGL, so MapLibre paints in headless Chromium.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  for (const viewport of VIEWPORTS) {
    if (values.only && values.only !== viewport.name) continue;
    for (const scheme of SCHEMES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        colorScheme: scheme,
        isMobile: viewport.name === 'mobile',
        hasTouch: viewport.name === 'mobile',
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      for (const shot of SHOTS) {
        if (shot.only && !shot.only.includes(viewport.name)) continue;
        const file = `${shot.name}-${viewport.name}-${scheme}.png`;
        try {
          await shot.run(page);
          await page.screenshot({ path: resolve(outDir, file) });
          console.log(`wrote ${file}`);
        } catch (error) {
          console.log(
            `FAILED ${file}: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
          );
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
