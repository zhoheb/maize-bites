export interface LatLng {
  lat: number;
  lng: number;
}

/** A rectangle on the map, in degrees. */
export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function inBbox(point: LatLng, box: Bbox): boolean {
  return (
    point.lng >= box.west &&
    point.lng <= box.east &&
    point.lat >= box.south &&
    point.lat <= box.north
  );
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Paths aren't straight lines; campus walks run about a quarter longer. */
const DETOUR = 1.25;
const WALK_M_PER_MIN = 80;
const M_PER_MILE = 1609.344;

/** "4 min walk" up to half an hour, then miles: "2.4 mi". An estimate from straight-line distance. */
export function formatWalk(meters: number): string {
  const minutes = Math.max(1, Math.round((meters * DETOUR) / WALK_M_PER_MIN));
  if (minutes <= 30) return `${minutes} min walk`;
  return `${(meters / M_PER_MILE).toFixed(1)} mi`;
}
