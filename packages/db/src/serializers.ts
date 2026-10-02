import type { FoodEvent } from '@maize-bites/shared';
import { FOOD_GONE_THRESHOLD } from '@maize-bites/shared';
import type { PublishedEvent } from './queries/events.js';

/** A published event in the shared wire format (API responses, emails, push). */
export function toFoodEvent({
  event,
  classification,
  building,
  recentFoodGone,
}: PublishedEvent): FoodEvent {
  return {
    id: event.id,
    source: event.source,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    locationName: event.locationName,
    room: event.room,
    building: building && { id: building.id, name: building.name, campus: building.campus },
    lat: event.lat ?? building?.lat ?? null,
    lng: event.lng ?? building?.lng ?? null,
    url: event.url,
    sponsor: event.sponsor,
    foodItems: classification?.foodItems ?? [],
    mealType: classification?.mealType ?? null,
    dietary: classification?.dietary ?? [],
    audience: classification?.audience ?? null,
    likelyGone: recentFoodGone >= FOOD_GONE_THRESHOLD,
  };
}

/** When an event became visible: its active verdict, or for a tip, when it was approved. */
export function publishedAt({ event, classification }: PublishedEvent): Date {
  return classification?.createdAt ?? event.firstSeenAt;
}
