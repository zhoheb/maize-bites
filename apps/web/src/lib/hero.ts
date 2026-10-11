import type { FoodEvent } from '@maize-bites/shared';
import type { Tab } from './filters';
import { formatDuration } from './format';
import { timeStatus } from './status';

export interface Hero {
  /** The headline, matching the selected range. */
  text: string;
  /** When nothing is live: the next event, to link to. `text` then ends with a dash. */
  next: { id: string; text: string } | null;
}

const plural = (n: number, more: boolean) => `${n}${more ? '+' : ''} ${n === 1 ? 'spot' : 'spots'}`;

/**
 * The headline for the list being shown, so the two can never disagree: "3 spots with free food
 * right now" on Now, "7 spots today", "18 spots this week". On Now with nothing live, it points
 * at what's next. Events reported as likely over don't count as live.
 */
export function hero(tab: Tab, events: readonly FoodEvent[], now: Date, more = false): Hero {
  if (tab === 'today') return { text: `${plural(events.length, more)} today`, next: null };
  if (tab === 'week') return { text: `${plural(events.length, more)} this week`, next: null };

  const live = events.filter((e) => !e.likelyGone && timeStatus(e, now) === 'now');
  if (live.length > 0)
    return { text: `${plural(live.length, false)} with free food right now`, next: null };

  const upcoming = events
    .filter((e) => !e.likelyGone && new Date(e.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (!upcoming) return { text: 'Nothing right now', next: null };

  const [first] = upcoming.foodItems;
  const what = first ? first.charAt(0).toUpperCase() + first.slice(1) : upcoming.title;
  const where = upcoming.building ? ` at ${upcoming.building.name}` : '';
  const wait = formatDuration(new Date(upcoming.startsAt).getTime() - now.getTime());
  return {
    text: 'Nothing right now — next up:',
    next: { id: upcoming.id, text: `${what}${where} in ${wait}` },
  };
}

export type Freshness = 'fresh' | 'aging' | 'old';

const MINUTE = 60_000;

/** How current the data is: fresh under 15 minutes, aging under 2 hours, old beyond. */
export function freshness(updatedAt: Date, now: Date): Freshness {
  const age = now.getTime() - updatedAt.getTime();
  if (age < 15 * MINUTE) return 'fresh';
  return age < 120 * MINUTE ? 'aging' : 'old';
}
