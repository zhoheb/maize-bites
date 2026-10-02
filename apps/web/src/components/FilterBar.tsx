import { CAMPUSES, DIETARY_TAGS, MEAL_TYPES } from '@maize-bites/shared';
import type { ReactNode } from 'react';
import { NO_FILTERS, hasActiveFilters, toggle, type Filters } from '../lib/filters';
import { CAMPUS_LABELS, DIETARY_LABELS, MEAL_LABELS } from '../lib/labels';
import { Chip } from './Chip';

function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = `filter-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 items-center gap-2">
      <span
        id={id}
        className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-600"
      >
        {label}
      </span>
      {/* Scrolls sideways on phones; wraps on wider screens. */}
      {/* min-w-0 lets this row shrink below its content width so it can scroll. */}
      <div className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 sm:flex-wrap sm:overflow-visible">
        {children}
      </div>
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <section aria-label="Filters" className="space-y-2">
      <Group label="Campus">
        {CAMPUSES.map((c) => (
          <Chip
            key={c}
            pressed={filters.campuses.includes(c)}
            onClick={() => {
              onChange({ ...filters, campuses: toggle(filters.campuses, c) });
            }}
          >
            {CAMPUS_LABELS[c]}
          </Chip>
        ))}
      </Group>

      <Group label="Diet">
        {DIETARY_TAGS.map((d) => (
          <Chip
            key={d}
            pressed={filters.dietary.includes(d)}
            onClick={() => {
              onChange({ ...filters, dietary: toggle(filters.dietary, d) });
            }}
          >
            {DIETARY_LABELS[d]}
          </Chip>
        ))}
      </Group>

      <Group label="Meal">
        {MEAL_TYPES.map((m) => (
          <Chip
            key={m}
            pressed={filters.mealType === m}
            onClick={() => {
              onChange({ ...filters, mealType: filters.mealType === m ? null : m });
            }}
          >
            {MEAL_LABELS[m]}
          </Chip>
        ))}
      </Group>

      <div className="flex items-center gap-2 pl-18">
        <Chip
          pressed={filters.openOnly}
          onClick={() => {
            onChange({ ...filters, openOnly: !filters.openOnly });
          }}
        >
          Open to all
        </Chip>
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={() => {
              onChange(NO_FILTERS);
            }}
            className="rounded px-2 py-1 text-sm font-medium text-michigan-blue underline underline-offset-2 hover:no-underline focus-visible:outline-3 focus-visible:outline-michigan-blue"
          >
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
}
