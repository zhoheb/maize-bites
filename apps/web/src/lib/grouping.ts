import type { FoodEvent } from '@maize-bites/shared';
import { campusDateFormat, dayOffset, localDayKey, timeStatus } from './status';

export interface EventGroup {
  /** Stable across re-renders: "now", "soon", "today", "ended", or a day such as "2026-10-12". */
  key: string;
  label: string;
  /** Extra words beside the label, e.g. "next 2 hours" or the date. */
  hint: string | null;
  events: FoodEvent[];
}

/**
 * The list in urgency order: happening now, starting soon, later today, then one group per
 * following day. Events that ended since the list was fetched sink to the bottom. Order within a
 * group is the order given (the API sorts by start time), except that events reported as likely
 * over go last in their group.
 */
export function groupEvents(events: readonly FoodEvent[], now: Date): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  const add = (
    order: string,
    key: string,
    label: string,
    hint: string | null,
    event: FoodEvent,
  ) => {
    const group = groups.get(order) ?? { key, label, hint, events: [] };
    group.events.push(event);
    groups.set(order, group);
  };

  for (const event of events) {
    const start = new Date(event.startsAt);
    const offset = dayOffset(start, now);
    switch (timeStatus(event, now)) {
      case 'now':
        add('0', 'now', 'Happening now', null, event);
        break;
      case 'soon':
        add('1', 'soon', 'Starting soon', 'next 2 hours', event);
        break;
      case 'ended':
        add('9', 'ended', 'Just ended', null, event);
        break;
      case 'later':
        if (offset <= 0) add('2', 'today', 'Later today', null, event);
        else {
          const key = localDayKey(start);
          const date = campusDateFormat.format(start);
          add(`3-${key}`, key, offset === 1 ? 'Tomorrow' : date, offset === 1 ? date : null, event);
        }
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => ({
      ...group,
      // Array.prototype.sort is stable, so the given order holds within each half.
      events: [...group.events].sort((a, b) => Number(a.likelyGone) - Number(b.likelyGone)),
    }));
}
