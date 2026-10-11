// Light/dark theme. The choice is stored per browser; with no stored choice the system setting
// decides. The inline script in index.html applies the same rule before first paint.

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'mb-theme';

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // storage blocked (private mode)
  }
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  return document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
}

const listeners = new Set<() => void>();

function apply(theme: Theme) {
  document.documentElement.dataset['theme'] = theme;
  for (const listener of listeners) listener();
}

/** Switches the theme and remembers the choice. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not saved; the choice still holds for this visit.
  }
  apply(theme);
}

/** Subscribes to theme changes, including system changes while no choice is stored. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    if (stored() === null) apply(systemTheme());
  };
  media.addEventListener('change', onSystem);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystem);
  };
}
