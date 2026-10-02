import { CAMPUS_TIME_ZONE, wallTimeOf, type FoodEvent } from '@maize-bites/shared';

/** The parts of a subscriptions row that decide who hears about what. */
export interface AlertFilters {
  campuses: readonly string[];
  dietary: readonly string[];
  openOnly: boolean;
}

/** Filters are ANDed. Empty campuses = anywhere; dietary needs must all be listed. */
export function matchesFilters(
  event: Pick<FoodEvent, 'building' | 'dietary' | 'audience'>,
  filters: AlertFilters,
): boolean {
  if (
    filters.campuses.length > 0 &&
    (!event.building || !filters.campuses.includes(event.building.campus))
  ) {
    return false;
  }
  if (!filters.dietary.every((need) => (event.dietary as readonly string[]).includes(need)))
    return false;
  if (filters.openOnly && event.audience !== 'open') return false;
  return true;
}

/** Minutes since midnight for "HH:MM" or "HH:MM:SS". */
function minutesOf(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Whether `now` falls in quiet hours [start, end) on the local (America/Detroit) clock.
 * Windows may wrap midnight (22:00–07:00). No window, or start === end, is never quiet.
 */
export function isQuietTime(
  now: Date,
  start: string | null,
  end: string | null,
  timeZone: string = CAMPUS_TIME_ZONE,
): boolean {
  if (!start || !end) return false;
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  const { hour, minute } = wallTimeOf(now, timeZone);
  const m = hour * 60 + minute;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Instant alerts only cover events published after the subscriber signed up (no backlog blast). */
export function isNewForSubscriber(publishedAt: Date, subscribedAt: Date): boolean {
  return publishedAt.getTime() >= subscribedAt.getTime();
}
