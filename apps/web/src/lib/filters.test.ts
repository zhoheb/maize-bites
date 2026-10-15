import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  hasActiveFilters,
  parseFilters,
  parseTab,
  toApiParams,
  toggle,
  withFilters,
} from './filters';

const params = (s: string) => new URLSearchParams(s);

describe('parseFilters', () => {
  it('reads every filter from the URL', () => {
    expect(parseFilters(params('campus=north,central&diet=vegan&open=1&meal=lunch'))).toEqual({
      campuses: ['central', 'north'], // canonical order
      dietary: ['vegan'],
      openOnly: true,
      includeUnspecified: false,
      mealType: 'lunch',
    });
  });

  it('reads "include unspecified" only together with "open to all"', () => {
    expect(parseFilters(params('open=1&unspec=1')).includeUnspecified).toBe(true);
    expect(parseFilters(params('unspec=1'))).toEqual(NO_FILTERS);
  });

  it('defaults to no filters', () => {
    expect(parseFilters(params(''))).toEqual(NO_FILTERS);
  });

  it('drops unknown or malformed values instead of failing', () => {
    expect(
      parseFilters(params('campus=central,dearborn,,central&diet=paleo&open=yes&meal=brunch')),
    ).toEqual({
      ...NO_FILTERS,
      campuses: ['central'],
    });
  });
});

describe('withFilters', () => {
  it('writes canonical params and keeps unrelated keys', () => {
    const next = withFilters(params('tab=today&event=abc&campus=north'), {
      campuses: ['north', 'central'],
      dietary: ['halal', 'vegan'],
      openOnly: true,
      includeUnspecified: true,
      mealType: 'snacks',
    });
    expect(next.toString()).toBe(
      'tab=today&event=abc&campus=central%2Cnorth&diet=vegan%2Chalal&open=1&unspec=1&meal=snacks',
    );
  });

  it('removes keys for cleared filters', () => {
    expect(
      withFilters(
        params('tab=week&campus=north&open=1&meal=lunch&diet=vegan'),
        NO_FILTERS,
      ).toString(),
    ).toBe('tab=week');
  });

  it('round-trips', () => {
    const filters = {
      campuses: ['medical' as const],
      dietary: ['kosher' as const],
      openOnly: false,
      includeUnspecified: false,
      mealType: null,
    };
    expect(parseFilters(withFilters(params(''), filters))).toEqual(filters);
  });
});

describe('helpers', () => {
  it('hasActiveFilters', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, openOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, mealType: 'dinner' })).toBe(true);
  });

  it('toggle', () => {
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggle(['b'], 'a')).toEqual(['b', 'a']);
  });

  it('parseTab defaults to now', () => {
    expect(parseTab(params('tab=week'))).toBe('week');
    expect(parseTab(params('tab=month'))).toBe('now');
    expect(parseTab(params(''))).toBe('now');
  });

  it('toApiParams maps to the API query names', () => {
    expect(
      toApiParams({
        campuses: ['central', 'north'],
        dietary: ['vegan'],
        openOnly: true,
        includeUnspecified: true,
        mealType: 'lunch',
      }),
    ).toEqual({
      campus: 'central,north',
      dietary: 'vegan',
      open_only: 'true',
      include_unspecified: 'true',
      meal_type: 'lunch',
    });
    // Without "open to all", "include unspecified" means nothing and isn't sent.
    expect(toApiParams({ ...NO_FILTERS, includeUnspecified: true })).toEqual({});
    expect(toApiParams(NO_FILTERS)).toEqual({});
  });
});
