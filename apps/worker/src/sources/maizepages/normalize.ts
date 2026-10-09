import type { NormalizedItem } from '../types.js';
import type { MaizepagesItem } from './schema.js';

/**
 * Roughly Ann Arbor. The feed geocodes every venue, including away games and off-campus
 * retreats; those keep their location name but get no pin, so the campus map stays a campus map.
 */
const ANN_ARBOR = { south: 42.2, north: 42.34, west: -83.82, east: -83.64 };

function campusCoordinates(geo: MaizepagesItem['geo']): { lat: number | null; lng: number | null } {
  const inArea =
    geo !== null &&
    geo.lat >= ANN_ARBOR.south &&
    geo.lat <= ANN_ARBOR.north &&
    geo.lng >= ANN_ARBOR.west &&
    geo.lng <= ANN_ARBOR.east;
  return inArea ? { lat: geo.lat, lng: geo.lng } : { lat: null, lng: null };
}

const clean = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/** Maps one validated Maize Pages item to our events shape. */
export function normalizeMaizepagesItem(item: MaizepagesItem): NormalizedItem {
  const startsAt = new Date(item.startsAt);
  let endsAt = item.endsAt === null ? null : new Date(item.endsAt);
  // events has a check constraint ends_at >= starts_at; drop a bad end rather than the event.
  if (endsAt !== null && endsAt < startsAt) endsAt = null;

  const locationName = clean(item.location);
  // An online event's "location" is a meeting link, which is not worth matching to a building.
  const isPlace = locationName !== null && !/^https?:\/\//i.test(locationName);

  return {
    event: {
      source: 'maizepages',
      sourceEventId: item.id,
      // Engage gives every occurrence of a recurring event its own id.
      occurrenceId: '0',
      title: clean(item.title) ?? '(untitled event)',
      description: clean(item.description),
      startsAt,
      endsAt,
      locationName,
      room: null,
      ...campusCoordinates(item.geo),
      url: item.url,
      sponsor: item.hosts.join(', ') || null,
      tags: item.categories,
      raw: item,
      status: item.status === 'cancelled' ? 'cancelled' : 'active',
      maizepagesEventId: item.id,
    },
    locationCandidates: isPlace ? [locationName] : [],
  };
}
