import { CAMPUSES, DIETARY_TAGS, MEAL_TYPES } from '@maize-bites/shared';
import type { Ref } from 'react';
import {
  NO_FILTERS,
  activeFilterChips,
  hasActiveFilters,
  toggle,
  type Filters,
  type Tab,
} from '../lib/filters';
import { CAMPUS_LABELS, DIETARY_LABELS, MEAL_LABELS } from '../lib/labels';
import { TAB_OPTIONS } from '../lib/tabs';
import { SearchBox } from './SearchBox';
import { Button } from './ui/Button';
import { RemovableChip } from './ui/Chip';
import { DropdownPill } from './ui/DropdownPill';
import { Segmented } from './ui/Segmented';
import { Toggle } from './ui/Toggle';

const CAMPUS_OPTIONS = CAMPUSES.map((value) => ({ value, label: CAMPUS_LABELS[value] }));
const DIET_OPTIONS = DIETARY_TAGS.map((value) => ({ value, label: DIETARY_LABELS[value] }));
const MEAL_OPTIONS = MEAL_TYPES.map((value) => ({ value, label: MEAL_LABELS[value] }));
const CHIP_LABELS = { campus: CAMPUS_LABELS, dietary: DIETARY_LABELS, meal: MEAL_LABELS };

/** The dropdown choices as removable chips. Renders nothing when none is set. */
export function ActiveFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const chips = activeFilterChips(filters, CHIP_LABELS);
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li key={chip.key}>
          <RemovableChip
            label={chip.label}
            onRemove={() => {
              onChange(chip.without);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything that narrows the list, in one row: when, three dropdown pills, the open-to-all
 * switch, search. Dropdown choices also show as removable chips on a second row, which exists
 * only when there are some.
 */
export function FilterBar({
  tab,
  onTab,
  filters,
  onChange,
  search,
  onSearch,
  searchRef,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  filters: Filters;
  onChange: (next: Filters) => void;
  search: string;
  onSearch: (value: string) => void;
  searchRef?: Ref<HTMLInputElement> | undefined;
}) {
  return (
    <section aria-label="Filters" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="When" value={tab} options={TAB_OPTIONS} onChange={onTab} />
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-line-strong xl:block" />
        <DropdownPill
          label="Campus"
          options={CAMPUS_OPTIONS}
          selected={filters.campuses}
          onToggle={(c) => {
            onChange({ ...filters, campuses: toggle(filters.campuses, c) });
          }}
        />
        <DropdownPill
          label="Diet"
          options={DIET_OPTIONS}
          selected={filters.dietary}
          onToggle={(d) => {
            onChange({ ...filters, dietary: toggle(filters.dietary, d) });
          }}
        />
        <DropdownPill
          label="Meal"
          single
          options={MEAL_OPTIONS}
          selected={filters.mealType ? [filters.mealType] : []}
          onToggle={(m) => {
            onChange({ ...filters, mealType: filters.mealType === m ? null : m });
          }}
        />
        <Toggle
          label="Open to all"
          className="ml-1"
          checked={filters.openOnly}
          onChange={(openOnly) => {
            onChange({ ...filters, openOnly });
          }}
        />
        <div className="ml-auto flex items-center gap-1">
          {hasActiveFilters(filters) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(NO_FILTERS);
              }}
            >
              Clear
            </Button>
          )}
          <SearchBox value={search} onChange={onSearch} inputRef={searchRef} className="w-72" />
        </div>
      </div>
      <ActiveFilters filters={filters} onChange={onChange} />
    </section>
  );
}
