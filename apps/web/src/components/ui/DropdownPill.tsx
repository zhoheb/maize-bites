import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './cx';

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A pill that opens a list of checkable options and shows how many are on ("Diet · 2"). Radix
 * supplies the keyboard handling, focus return and ARIA roles.
 */
export function DropdownPill<T extends string>({
  label,
  options,
  selected,
  onToggle,
  single = false,
}: {
  label: string;
  options: readonly PillOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** One choice at a time: the menu closes on pick and the pill shows the choice. */
  single?: boolean;
}) {
  const count = selected.length;
  const only = single ? options.find((o) => o.value === selected[0]) : undefined;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={cx(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pr-2.5 pl-3.5 text-sm font-medium transition-colors',
          count > 0
            ? 'border-ink bg-card text-ink'
            : 'border-line-strong bg-card text-ink hover:bg-sunken',
        )}
      >
        {only ? only.label : label}
        {count > 0 && !only && (
          <span className="tabular">
            <span aria-hidden="true">· </span>
            {count}
            <span className="sr-only"> selected</span>
          </span>
        )}
        <ChevronDown aria-hidden="true" className="size-4 text-ink-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-48 rounded-card border border-line bg-raised p-1.5 text-ink shadow-lift"
        >
          {options.map((option) => {
            const on = selected.includes(option.value);
            return (
              <DropdownMenu.CheckboxItem
                key={option.value}
                checked={on}
                onCheckedChange={() => {
                  onToggle(option.value);
                }}
                // Multi-select menus stay open so several options can be ticked in one visit.
                onSelect={(e) => {
                  if (!single) e.preventDefault();
                }}
                className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg pr-3 pl-2 text-sm outline-none select-none data-highlighted:bg-sunken"
              >
                <span
                  className={cx(
                    'grid size-4.5 place-items-center rounded-[5px] border',
                    on ? 'border-primary bg-primary text-on-primary' : 'border-line-strong',
                  )}
                >
                  <DropdownMenu.ItemIndicator>
                    <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                  </DropdownMenu.ItemIndicator>
                </span>
                {option.label}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
