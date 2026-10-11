import { useEffect, useState } from 'react';

/**
 * False on the first render, then true once the browser has a quiet moment (or after `timeout`
 * at the latest). Used to hold back heavy, non-essential work, such as starting the map, until
 * the list has painted.
 */
export function useIdle(timeout = 2000): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const done = () => {
      setIdle(true);
    };
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback !== 'function') {
      const id = setTimeout(done, 200);
      return () => {
        clearTimeout(id);
      };
    }
    const id = window.requestIdleCallback(done, { timeout });
    return () => {
      window.cancelIdleCallback(id);
    };
  }, [timeout]);
  return idle;
}
