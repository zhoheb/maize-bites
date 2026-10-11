import type { FoodEvent } from '@maize-bites/shared';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Everything a search can match: title, food, building, room, raw location, host. */
function haystack(event: FoodEvent): string {
  return fold(
    [
      event.title,
      ...event.foodItems,
      event.building?.name,
      event.locationName,
      event.room,
      event.sponsor,
    ]
      .filter(Boolean)
      .join(' \n '),
  );
}

/** True when every word of `query` appears somewhere in the event ("pizza union"). */
export function matchesSearch(event: FoodEvent, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(event);
  return words.every((word) => text.includes(word));
}

export function searchEvents(events: readonly FoodEvent[], query: string): FoodEvent[] {
  return query.trim() === '' ? [...events] : events.filter((e) => matchesSearch(e, query));
}
