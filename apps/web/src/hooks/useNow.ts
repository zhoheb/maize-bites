import { useSyncExternalStore } from 'react';

// One shared clock for every countdown and "updated" stamp: a single 30-second timer however
// many components read it, and they all tick in the same frame. Components that show a time
// subscribe themselves, so a tick re-renders those small pieces and not the list around them.

const TICK_MS = 30_000;

let now = new Date();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
  now = new Date();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = new Date();
    timer = setInterval(tick, TICK_MS);
    // A backgrounded tab throttles timers; catch up the moment it is looked at again.
    document.addEventListener('visibilitychange', tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', tick);
    }
  };
}

const snapshot = () => now;

/** The current time, refreshed every 30 seconds. */
export function useNow(): Date {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
