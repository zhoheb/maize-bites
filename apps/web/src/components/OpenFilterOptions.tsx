import type { Filters } from '../lib/filters';
import { cx } from './ui/cx';

/**
 * Shown while "Open to all" is on: what it means, and the choice to add events whose listing
 * doesn't say who can come. Off by default, so "open to all" never includes a guess.
 */
export function OpenFilterOptions({
  filters,
  onChange,
  className,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  className?: string | undefined;
}) {
  if (!filters.openOnly) return null;
  return (
    <div
      className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2', className)}
    >
      <p>Only events whose listing says they're open.</p>
      <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-ink">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={filters.includeUnspecified}
          onChange={(e) => {
            onChange({ ...filters, includeUnspecified: e.target.checked });
          }}
        />
        Include unspecified
      </label>
    </div>
  );
}
