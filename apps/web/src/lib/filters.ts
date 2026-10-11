import {
  CAMPUSES,
  DIETARY_TAGS,
  MEAL_TYPES,
  type Campus,
  type DietaryTag,
  type MealType,
} from '@maize-bites/shared';

// Home page state lives in the URL so views are shareable and survive reloads:
//   ?tab=today&campus=central,north&diet=vegan&open=1&meal=lunch&q=pizza&event=<id>&view=list

export const TABS = ['now', 'today', 'week'] as const;
export type Tab = (typeof TABS)[number];

export interface Filters {
  campuses: Campus[];
  dietary: DietaryTag[];
  openOnly: boolean;
  mealType: MealType | null;
}

export const NO_FILTERS: Filters = { campuses: [], dietary: [], openOnly: false, mealType: null };

/** Known values from a comma list, deduped, in canonical order. Unknown values are dropped. */
function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const values = new Set(raw.split(','));
  return allowed.filter((v) => values.has(v));
}

export function parseFilters(params: URLSearchParams): Filters {
  const meal = params.get('meal');
  return {
    campuses: parseList(params.get('campus'), CAMPUSES),
    dietary: parseList(params.get('diet'), DIETARY_TAGS),
    openOnly: params.get('open') === '1',
    mealType: MEAL_TYPES.find((m) => m === meal) ?? null,
  };
}

/** Returns a copy of `params` with the filter keys replaced; other keys (tab, event) are kept. */
export function withFilters(params: URLSearchParams, filters: Filters): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  };
  set('campus', CAMPUSES.filter((c) => filters.campuses.includes(c)).join(','));
  set('diet', DIETARY_TAGS.filter((d) => filters.dietary.includes(d)).join(','));
  set('open', filters.openOnly ? '1' : null);
  set('meal', filters.mealType);
  return next;
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.campuses.length > 0 ||
    filters.dietary.length > 0 ||
    filters.openOnly ||
    filters.mealType !== null
  );
}

export function countActiveFilters(filters: Filters): number {
  return (
    filters.campuses.length +
    filters.dietary.length +
    (filters.openOnly ? 1 : 0) +
    (filters.mealType === null ? 0 : 1)
  );
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function parseTab(params: URLSearchParams): Tab {
  const tab = params.get('tab');
  return TABS.find((t) => t === tab) ?? 'now';
}

/** Query params for the events API. */
export function toApiParams(filters: Filters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.campuses.length > 0) params['campus'] = filters.campuses.join(',');
  if (filters.dietary.length > 0) params['dietary'] = filters.dietary.join(',');
  if (filters.openOnly) params['open_only'] = 'true';
  if (filters.mealType) params['meal_type'] = filters.mealType;
  return params;
}

export interface FilterChip {
  key: string;
  label: string;
  /** The filters with this one removed. */
  without: Filters;
}

/** One removable chip per active filter, in the order of the filter row. */
export function activeFilterChips(
  filters: Filters,
  labels: {
    campus: Record<Campus, string>;
    dietary: Record<DietaryTag, string>;
    meal: Record<MealType, string>;
  },
): FilterChip[] {
  return [
    ...filters.campuses.map((c) => ({
      key: `campus-${c}`,
      label: `${labels.campus[c]} Campus`,
      without: { ...filters, campuses: filters.campuses.filter((v) => v !== c) },
    })),
    ...filters.dietary.map((d) => ({
      key: `diet-${d}`,
      label: labels.dietary[d],
      without: { ...filters, dietary: filters.dietary.filter((v) => v !== d) },
    })),
    ...(filters.mealType
      ? [
          {
            key: `meal-${filters.mealType}`,
            label: labels.meal[filters.mealType],
            without: { ...filters, mealType: null },
          },
        ]
      : []),
    ...(filters.openOnly
      ? [{ key: 'open', label: 'Open to all', without: { ...filters, openOnly: false } }]
      : []),
  ];
}
