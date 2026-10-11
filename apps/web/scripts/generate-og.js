// Renders the Open Graph image (public/og.png, 1200×630) from a small HTML page, with Playwright
// and the Chromium already installed on this machine. Rerun after changing the logo or tagline.
//
//   pnpm --filter @maize-bites/web exec node scripts/generate-og.js
/* global document */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const font = (pkg, file) =>
  readFileSync(
    fileURLToPath(
      new URL(`../node_modules/@fontsource-variable/${pkg}/files/${file}`, import.meta.url),
    ),
  ).toString('base64');
const logo = readFileSync(new URL('../public/icons/favicon.svg', import.meta.url), 'utf8');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: Display; font-weight: 200 800;
    src: url(data:font/woff2;base64,${font('bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2')}) format('woff2'); }
  @font-face { font-family: Body; font-weight: 100 900;
    src: url(data:font/woff2;base64,${font('inter', 'inter-latin-wght-normal.woff2')}) format('woff2'); }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #0b1f3a; color: #f4f1ea; padding: 72px 80px;
    display: flex; flex-direction: column; justify-content: space-between; font-family: Body; }
  .brand { display: flex; align-items: center; gap: 20px; font: 700 40px Display; letter-spacing: -0.02em; }
  .brand svg { width: 72px; height: 72px; border-radius: 18px; outline: 2px solid #233c61; }
  h1 { font: 700 92px/1.02 Display; letter-spacing: -0.03em; max-width: 960px; }
  h1 em { font-style: normal; color: #ffcb05; }
  p { font-size: 30px; color: #b9c4d6; }
  .now { display: inline-flex; align-items: center; gap: 12px; }
  .dot { width: 16px; height: 16px; border-radius: 50%; background: #3ddc84; box-shadow: 0 0 0 7px rgb(61 220 132 / 0.25); }
</style></head><body>
  <div class="brand">${logo}<span>Maize Bites</span></div>
  <h1>Free food on campus, <em>right now.</em></h1>
  <p class="now"><span class="dot"></span>What's out, where it is, and how soon. University of Michigan.</p>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
  await page.screenshot({ path: out });
  console.log('wrote public/og.png');
} finally {
  await browser.close();
}
