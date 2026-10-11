import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// WCAG AA contrast for the design tokens, read straight from index.css so the check can't
// drift from what ships. Normal text needs 4.5:1; large or bold-large text and UI parts 3:1.

// Vitest runs from the package root (apps/web).
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in index.css`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, background token]: every pairing the components use for text. */
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink', 'sunken'],
  ['ink-2', 'bg'],
  ['ink-2', 'surface'],
  ['ink-2', 'sunken'],
  ['ink-3', 'bg'],
  ['ink-3', 'surface'],
  ['ink-3', 'sunken'],
  ['on-primary', 'primary'],
  ['on-maize', 'maize'],
  ['now', 'now-bg'],
  ['now', 'surface'],
  ['now', 'bg'],
  ['warn', 'warn-bg'],
  ['warn', 'surface'],
  ['amber', 'surface'],
  ['amber', 'bg'],
  ['info', 'surface'],
  ['food', 'surface'],
  ['food', 'bg'],
];

/** Non-text parts that must be distinguishable (3:1): the focus ring and the live dot. */
const UI_PAIRS: [string, string][] = [
  ['focus', 'bg'],
  ['focus', 'surface'],
  ['now-dot', 'bg'],
  ['now-dot', 'surface'],
];

describe.each([
  ['light', ':root'],
  ['dark', ":root[data-theme='dark']"],
])('%s theme tokens', (_name, selector) => {
  const t = tokens(selector);
  const ratio = (fg: string, bg: string) => {
    const a = t[fg];
    const b = t[bg];
    if (!a || !b) throw new Error(`missing token --${fg} or --${bg}`);
    return contrast(a, b);
  };

  it.each(TEXT_PAIRS)('--%s on --%s meets AA for text (4.5:1)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('--%s on --%s meets AA for UI parts (3:1)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('maize', () => {
  it('is never text on a light surface: it fails contrast there, so it stays a background', () => {
    const light = tokens(':root');
    expect(contrast(light['maize'] ?? '', light['surface'] ?? '')).toBeLessThan(3);
  });
});
