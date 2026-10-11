import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// Browser APIs jsdom doesn't have, which Radix, vaul, and our own layout code call. They are
// defined directly (not with vi.stubGlobal) so a test's vi.unstubAllGlobals() leaves them be.
const define = (name: string, value: unknown) => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};

/** Media queries never match unless a test says so with `setMediaQueries`. */
let matching: (query: string) => boolean = () => false;
export function setMediaQueries(matches: (query: string) => boolean) {
  matching = matches;
}
afterEach(() => {
  matching = () => false;
});
define('matchMedia', (query: string) => ({
  media: query,
  get matches() {
    return matching(query);
  },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  onchange: null,
  dispatchEvent: () => false,
}));

class NoopObserver {
  observe() {
    // nothing to observe in jsdom
  }
  unobserve() {
    // nothing to observe in jsdom
  }
  disconnect() {
    // nothing to observe in jsdom
  }
}
define('ResizeObserver', NoopObserver);

Element.prototype.scrollIntoView = () => undefined;
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
// Enough of CSS.escape for the ids we pass (uuids).
define('CSS', { escape: (value: string) => value.replace(/["\\]/g, '\\$&') });
