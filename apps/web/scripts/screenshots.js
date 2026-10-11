// Captures the Home page at desktop and phone sizes, in light and dark, with Playwright and
// the Chromium already installed on this machine (it never downloads a browser).
//
//   pnpm --filter @maize-bites/web screenshots -- --label after
//   pnpm --filter @maize-bites/web screenshots -- --label before --out docs/screenshots/x
//
// Needs the site running (pnpm dev) and, for a full set of states, pnpm db:seed:demo.
/* global document */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    label: { type: 'string', default: 'after' },
    out: { type: 'string', default: '../../docs/screenshots/ui-redesign' },
    base: { type: 'string', default: 'http://localhost:5173' },
  },
});
const outDir = resolve(values.out);
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const SCHEMES = ['light', 'dark'];
/** `open` clicks the first event card before the capture, to show the detail drawer. */
const PAGES = [
  { name: 'home', path: '/?tab=week' },
  { name: 'now', path: '/' },
  { name: 'details', path: '/?tab=week', open: true },
  { name: 'about', path: '/about', only: 'desktop' },
];

/** Resolves once the map has painted its tiles, or after `timeout` if there is no map. */
async function waitForMap(page, timeout = 20_000) {
  const canvas = page.locator('.maplibregl-canvas');
  try {
    await canvas.first().waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
    return false; // list-only view
  }
  try {
    // The redesigned map marks its container once MapLibre reports idle (all tiles drawn).
    await page.waitForSelector('[data-map-idle="true"]', { timeout });
  } catch {
    await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
    await page.waitForTimeout(2_000);
  }
  return true;
}

const browser = await chromium.launch({
  // Software WebGL, so MapLibre paints in headless Chromium.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  for (const viewport of VIEWPORTS) {
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
      for (const target of PAGES) {
        if (target.only && target.only !== viewport.name) continue;
        await page.goto(values.base + target.path, { waitUntil: 'domcontentloaded' });
        await page
          .waitForSelector('article, [data-empty-state], main h1', { timeout: 20_000 })
          .catch(() => undefined);
        await page.evaluate(() => document.fonts.ready);
        const hasMap = await waitForMap(page);
        if (target.open) {
          // Open the first event the way its card does: by its link.
          const href = await page.locator('article a').first().getAttribute('href');
          if (!href) continue;
          await page.goto(values.base + href, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('[role="dialog"] h2, dialog h2', { timeout: 10_000 });
          await page.waitForTimeout(1_500); // drawer animation and its mini map
        }
        const file = `${values.label}-${target.name}-${viewport.name}-${scheme}.png`;
        await page.screenshot({ path: resolve(outDir, file) });
        console.log(`wrote ${file}${hasMap ? '' : ' (no map in this view)'}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
