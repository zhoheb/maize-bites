import type { FoodEvent } from '@maize-bites/shared';
import { EXCEPTION_LABELS, exceptionBadges } from './badges';
import { formatFood, formatLocation } from './format';
import { statusPill } from './status';

export type LocatedEvent = FoodEvent & { lat: number; lng: number };

export function isLocated(event: FoodEvent): event is LocatedEvent {
  return event.lat !== null && event.lng !== null;
}

/**
 * What a screen reader says for a map pin: everything the card says, in one sentence, since the
 * pin has no visible text. "Pizza at the Dude. Happening now · ends in 25 min. Pizza. Duderstadt
 * Center · 1180. Members only. Show details."
 */
export function pinLabel(event: FoodEvent, now: Date): string {
  const parts = [
    event.title,
    statusPill(event, now).text,
    event.foodItems.length > 0 ? formatFood(event.foodItems) : null,
    formatLocation(event),
    ...exceptionBadges(event).map((badge) => EXCEPTION_LABELS[badge]),
  ].filter((part): part is string => Boolean(part));
  return `${parts.join('. ')}. Show on map.`;
}
