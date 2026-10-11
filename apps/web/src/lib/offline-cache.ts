import { foodEventSchema, type FoodEvent } from '@maize-bites/shared';
import { z } from 'zod';
import type { Filters, Tab } from './filters';

// The last list this browser loaded for each tab, kept in localStorage so an installed app
// opened with no connection has something to show. The service worker deliberately never
// caches /api (a stale list presented as live would mislead); this copy is only ever shown
// under an "offline, as of 3:42 PM" banner.

const KEY = 'mb-last-lists';

const savedListSchema = z.object({
  savedAt: z.iso.datetime({ offset: true }),
  filters: z.string(),
  events: z.array(foodEventSchema),
});
const storeSchema = z.record(z.string(), savedListSchema);

export interface SavedList {
  savedAt: Date;
  events: FoodEvent[];
}

function read(): z.infer<typeof storeSchema> {
  try {
    const parsed = storeSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {}; // storage blocked, or not JSON
  }
}

export function saveList(tab: Tab, filters: Filters, events: readonly FoodEvent[], now: Date) {
  try {
    const store = read();
    store[tab] = {
      savedAt: now.toISOString(),
      filters: JSON.stringify(filters),
      events: [...events],
    };
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: offline viewing just won't have this list.
  }
}

/** The saved list for this tab, if it was saved with these same filters. */
export function loadList(tab: Tab, filters: Filters): SavedList | null {
  const saved = read()[tab];
  if (saved?.filters !== JSON.stringify(filters)) return null;
  return { savedAt: new Date(saved.savedAt), events: saved.events };
}
