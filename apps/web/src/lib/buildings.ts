import type { Building } from '@maize-bites/shared';

const MAX_OPTIONS = 8;

/**
 * Buildings whose name or any alias contains every word typed. Best first: the name starts with
 * the query, then a word of the name or an alias starts with it, then everything else.
 */
export function matchBuildings(buildings: readonly Building[], query: string): Building[] {
  const typed = query.trim().toLowerCase();
  const words = typed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const rank = (b: Building): number => {
    const name = b.name.toLowerCase();
    if (name.startsWith(typed)) return 0;
    const starts = [...name.split(/\s+/), ...b.aliases.map((a) => a.toLowerCase())];
    return starts.some((s) => s.startsWith(typed)) ? 1 : 2;
  };
  return buildings
    .filter((b) => {
      const haystack = [b.name, ...b.aliases].join(' ').toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, MAX_OPTIONS);
}
