import { decodeHtmlEntities } from '../sources/html.js';

export interface MatchableBuilding {
  id: string;
  name: string;
  aliases: readonly string[];
}

/**
 * Canonical form for comparing location names: entities decoded, accents stripped,
 * lowercase, `&` → `and`, punctuation → spaces, whitespace collapsed, leading "the" dropped.
 * "Art &amp; Architecture Bldg." → "art and architecture bldg"
 */
export function normalizeLocationName(value: string): string {
  return decodeHtmlEntities(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

export type LocationMatcher = (name: string) => MatchableBuilding | null;

/**
 * Builds a matcher over building names and aliases.
 *
 * 1. Exact match on the normalized name or any alias.
 * 2. Otherwise, the longest multi-word name/alias that the location starts with, on a word
 *    boundary: "Taubman Health Sciences Library 2903" → Taubman Health Sciences Library.
 *    Single-word aliases ("Union", "Dude") only match exactly, so "Union Street" doesn't
 *    become the Michigan Union.
 * 3. If the whole string fails, the same rules per segment split on , ; ( ) and spaced dashes.
 *
 * A key claimed by two different buildings is dropped rather than guessed.
 */
export function createLocationMatcher(buildings: readonly MatchableBuilding[]): LocationMatcher {
  const byKey = new Map<string, MatchableBuilding | null>();
  for (const building of buildings) {
    for (const key of [building.name, ...building.aliases].map(normalizeLocationName)) {
      if (key === '') continue;
      const existing = byKey.get(key);
      byKey.set(key, existing === undefined || existing?.id === building.id ? building : null);
    }
  }

  const prefixKeys = [...byKey.entries()]
    .filter(
      (entry): entry is [string, MatchableBuilding] => entry[1] !== null && entry[0].includes(' '),
    )
    .sort(([a], [b]) => b.length - a.length);

  const matchOne = (text: string): MatchableBuilding | null => {
    const normalized = normalizeLocationName(text);
    if (normalized === '') return null;
    const exact = byKey.get(normalized);
    if (exact) return exact;
    return prefixKeys.find(([key]) => normalized.startsWith(`${key} `))?.[1] ?? null;
  };

  // Whole string first, then each segment: "Vandenberg Room, Michigan League", "Diag - Central Campus".
  return (name) => {
    for (const text of [name, ...name.split(SEGMENT_SEPARATORS)]) {
      const building = matchOne(text);
      if (building) return building;
    }
    return null;
  };
}

const SEGMENT_SEPARATORS = /,|;|\s[-–—|]\s|[()]/;

/** Feed placeholders that are never a building, so they aren't worth logging as misses. */
const NOT_A_PLACE = new Set(['off campus location', 'ann arbor', 'virtual', 'online', 'zoom']);

export interface LocationResolution {
  buildingId: string | null;
  /** Set when there was something to match but nothing matched. */
  miss: { normalizedName: string; locationName: string } | null;
}

/** Tries each candidate in order; reports the most specific (last) real name as the miss. */
export function resolveLocation(
  candidates: readonly string[],
  match: LocationMatcher,
): LocationResolution {
  for (const candidate of candidates) {
    const building = match(candidate);
    if (building) return { buildingId: building.id, miss: null };
  }
  const reportable = candidates.filter((c) => !NOT_A_PLACE.has(normalizeLocationName(c)));
  const locationName = reportable.at(-1);
  return {
    buildingId: null,
    miss:
      locationName === undefined
        ? null
        : { normalizedName: normalizeLocationName(locationName), locationName },
  };
}
