import { useSyncExternalStore } from 'react';
import { currentTheme, setTheme, subscribeTheme, type Theme } from '../lib/theme';

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, (): Theme => 'light');
  return {
    theme,
    toggle: () => {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    },
  };
}
