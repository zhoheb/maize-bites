import { CAMPUS_TIME_ZONE, effectiveEnd, type FoodEvent } from '@maize-bites/shared';

// Events are on campus, so always show Ann Arbor time regardless of the viewer's zone.

const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

export function formatTimeRange(event: Pick<FoodEvent, 'startsAt' | 'endsAt'>): string {
  const start = new Date(event.startsAt);
  const startDay = dayFormat.format(start);
  const startTime = timeFormat.format(start);
  if (event.endsAt === null) return `${startDay} · ${startTime}`;

  const end = new Date(event.endsAt);
  const endDay = dayFormat.format(end);
  const endTime = timeFormat.format(end);
  return endDay === startDay
    ? `${startDay} · ${startTime} – ${endTime}`
    : `${startDay} ${startTime} – ${endDay} ${endTime}`;
}

/** "Duderstadt Center · 1180", falling back to the raw feed location. */
export function formatLocation(
  event: Pick<FoodEvent, 'building' | 'room' | 'locationName'>,
): string | null {
  if (event.building) {
    return event.room ? `${event.building.name} · ${event.room}` : event.building.name;
  }
  return event.locationName;
}

const MEAL_WORDS = new Set(['breakfast', 'brunch', 'lunch', 'luncheon', 'dinner', 'supper']);

/**
 * "Pizza, salad, cookies": the items as the classifier gave them, sentence-cased. When all the
 * listing said was that a meal is served ("Lunch will be provided"), say that in full, so a
 * bare "Lunch" doesn't read like a category we assigned.
 */
export function formatFood(items: readonly string[]): string {
  const text = items.join(', ');
  const cased = text.charAt(0).toUpperCase() + text.slice(1);
  return items.every((item) => MEAL_WORDS.has(item.toLowerCase())) ? `${cased} provided` : cased;
}

/**
 * What an event's food line says: the extracted items, else the meal the classifier named,
 * else nothing. A meal is never inferred here from the time of day or anything else.
 */
export function foodText(
  event: Pick<FoodEvent, 'foodItems' | 'mealType'>,
  mealLabels: Record<NonNullable<FoodEvent['mealType']>, string>,
): string | null {
  if (event.foodItems.length > 0) return formatFood(event.foodItems);
  return event.mealType ? mealLabels[event.mealType] : null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "25 min", "2 hr", "2 hr 5 min", "3 days". */
export function formatDuration(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))} min`;
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
  }
  const days = Math.floor(ms / DAY);
  return days === 1 ? '1 day' : `${days} days`;
}

export type CountdownStatus = 'upcoming' | 'live' | 'ended';

/** "Starts in 25 min", "Ends in 1 hr 5 min", "Ended". Events without an end last an hour. */
export function countdown(
  event: Pick<FoodEvent, 'startsAt' | 'endsAt'>,
  now: Date,
): { status: CountdownStatus; text: string } {
  const start = new Date(event.startsAt).getTime();
  const end = effectiveEnd(event).getTime();
  const t = now.getTime();

  if (t < start) {
    return {
      status: 'upcoming',
      text: start - t < MINUTE ? 'Starting now' : `Starts in ${formatDuration(start - t)}`,
    };
  }
  if (t < end) {
    return {
      status: 'live',
      text: end - t < MINUTE ? 'Ending now' : `Ends in ${formatDuration(end - t)}`,
    };
  }
  return { status: 'ended', text: 'Ended' };
}

/** "just now", "12 min ago", "3 hr ago", "2 days ago". */
export function formatRelative(date: Date, now: Date): string {
  const ms = now.getTime() - date.getTime();
  if (ms < MINUTE) return 'just now';
  return `${formatDuration(ms)} ago`;
}

/** Walking directions in Apple Maps on Apple devices (`apple`), Google Maps elsewhere. */
export function directionsUrl(
  event: Pick<FoodEvent, 'lat' | 'lng' | 'building' | 'locationName'>,
  apple = false,
): string | null {
  const destination =
    event.lat !== null && event.lng !== null
      ? `${event.lat},${event.lng}`
      : (event.building?.name ?? event.locationName)
        ? `${event.building?.name ?? event.locationName ?? ''}, Ann Arbor, MI`
        : null;
  if (destination === null) return null;
  if (apple) return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=w`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}

/** The shareable address of an event: its own page, not the drawer state of someone's list. */
export const eventUrl = (id: string) => `${window.location.origin}/events/${id}`;

/** Apple Maps is the native choice on Apple devices; Google Maps everywhere else. */
export const isApplePlatform = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
