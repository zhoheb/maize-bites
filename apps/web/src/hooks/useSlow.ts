import { useEffect, useState } from 'react';

/**
 * True once `active` has stayed true for `afterMs`. For saying something reassuring when a
 * wait runs long, without flashing it on waits that are merely normal.
 */
export function useSlow(active: boolean, afterMs: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setSlow(true);
    }, afterMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, afterMs]);
  return active && slow;
}
