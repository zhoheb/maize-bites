import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// WCAG AA contrast for the design tokens, read straight from index.css so the check can't
// drift from what ships. Normal text needs 4.5:1; icons and other UI parts need 3:1.

// Vitest runs from the package root (apps/web).
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

type Rgba = [r: number, g: number, b: number, a: number];

function parse(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(value);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  return null;
}

/** Every colour token in a theme block, by name. */
function tokens(selector: string): Record<string, Rgba> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in index.css`);
  const block = css.slice(start, css.indexOf('\n}', start));
  const found: Record<string, Rgba> = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const colour = parse((value ?? '').trim());
    if (name && colour) found[name] = colour;
  }
  return found;
}

/** A translucent colour as it appears over an opaque one. */
function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, background token]: every pairing the components use for text. */
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'bg'],
  ['ink', 'panel'],
  ['ink', 'card'],
  ['ink', 'raised'],
  ['ink', 'sunken'],
  ['ink-2', 'bg'],
  ['ink-2', 'panel'],
  ['ink-2', 'card'],
  ['ink-2', 'raised'],
  ['ink-2', 'sunken'],
  ['ink-3', 'bg'],
  ['ink-3', 'panel'],
  ['ink-3', 'card'],
  ['ink-3', 'raised'],
  ['ink-3', 'sunken'],
  ['on-primary', 'primary'],
  ['on-active', 'active'],
  ['maize-ink', 'maize'],
  ['ink', 'maize-soft'],
  ['ink-2', 'maize-soft'],
  ['now-ink', 'now-soft'],
  ['now-ink', 'card'],
  ['now-ink', 'bg'],
  ['soon-ink', 'soon-soft'],
  ['soon-ink', 'bg'],
  ['soon-ink', 'panel'],
  ['members', 'card'],
  ['members', 'bg'],
  ['members', 'sunken'],
  ['rsvp', 'card'],
  ['rsvp', 'bg'],
  ['danger', 'danger-soft'],
  ['danger', 'card'],
];

/** Icons and other non-text parts that must be distinguishable (3:1). */
const UI_PAIRS: [string, string][] = [
  ['focus', 'bg'],
  ['focus', 'card'],
  ['focus', 'panel'],
  ['now', 'bg'],
  ['now', 'card'],
  ['soon', 'card'],
  ['maize-ink', 'maize'],
  ['meal-breakfast-ink', 'meal-breakfast'],
  ['meal-lunch-ink', 'meal-lunch'],
  ['meal-dinner-ink', 'meal-dinner'],
  ['meal-snacks-ink', 'meal-snacks'],
  ['meal-drinks-ink', 'meal-drinks'],
  ['meal-other-ink', 'meal-other'],
];

describe.each([
  ['light', ':root'],
  ['dark', ":root[data-theme='dark']"],
])('%s theme tokens', (_name, selector) => {
  const t = tokens(selector);
  const ratio = (fg: string, bg: string) => {
    const text = t[fg];
    const back = t[bg];
    const card = t['card'];
    if (!text || !back || !card) throw new Error(`missing token --${fg}, --${bg} or --card`);
    // Soft backgrounds are translucent in dark mode: judge them as they sit on a card.
    return contrast(text, over(back, card));
  };

  it.each(TEXT_PAIRS)('--%s on --%s meets AA for text (4.5:1)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('--%s on --%s meets AA for UI parts (3:1)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('has no pure black or pure white surface in dark mode, and steps up in lightness', () => {
    if (selector === ':root') return;
    const surfaces = ['sunken', 'bg', 'panel', 'card', 'raised'].map((name) => {
      const colour = t[name];
      if (!colour) throw new Error(`missing --${name}`);
      return luminance(colour);
    });
    expect(surfaces).toEqual([...surfaces].sort((a, b) => a - b));
    expect(surfaces[0]).toBeGreaterThan(0);
    const ink = t['ink'];
    expect(ink && luminance(ink)).toBeLessThan(1);
  });
});

describe('maize', () => {
  it('is never text on a light surface: it fails contrast there, so it stays a fill', () => {
    const light = tokens(':root');
    const maize = light['maize'];
    const card = light['card'];
    if (!maize || !card) throw new Error('missing --maize or --card');
    expect(contrast(maize, card)).toBeLessThan(3);
  });

  it('is used by no control: only pins, selection, the nav underline and the logo', () => {
    // The components that may name maize. Anything else reaching for it fails here.
    const allowed = new Set([
      'components/AgendaRow.tsx', // selected row
      'components/NowCard.tsx', // selected card
      'components/AppShell.tsx', // current page underline, skip link
      'components/Logo.tsx',
      'components/HeroStrip.tsx', // hover underline on the "next up" link
      'components/forms.ts', // link hover underline
    ]);
    const files = import.meta.glob<string>('../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const users = Object.entries(files)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, source]) => /\b(bg|text|border|ring|fill|decoration)-maize\b(?!-)/.test(source))
      .map(([path]) => path.replace('../', ''));
    expect(users.filter((path) => !allowed.has(path))).toEqual([]);
  });
});
