import { expect } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Fails with the rule ids and offending nodes when axe finds an accessibility violation.
 * jsdom has no layout or painting, so axe's colour-contrast rule can't run here; contrast is
 * checked on the design tokens instead (lib/tokens.test.ts).
 */
export async function expectAccessible(container: Element) {
  const { violations } = await axe(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
}
