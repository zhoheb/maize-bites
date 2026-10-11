import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './cx';

export interface MenuOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A "pill menu": a pill that opens a list of checkable options and shows how many are on
 * ("Diet · 2"). Radix supplies the keyboard handling, focus return and ARIA roles.
 */
export function PillMenu<T extends string>({
  label,
  options,
  selected,
  onToggle,
  single = false,
}: {
  label: string;
  options: readonly MenuOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** One choice at a time: the menu closes on pick and items are radio-like. */
  single?: boolean;
}) {
  const count = selected.length;
  const only = single ? options.find((o) => o.value === selected[0]) : undefined;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={cx(
          'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border pr-3 pl-3.5 text-sm font-medium transition-colors',
          count > 0
            ? 'border-on-maize/20 bg-maize text-on-maize'
            : 'border-line-strong bg-surface text-ink hover:bg-sunken',
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
        <ChevronDown aria-hidden="true" className="size-4 opacity-70" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-48 rounded-card border border-line bg-surface p-1.5 text-ink shadow-lift"
        >
          {options.map((option) => (
            <DropdownMenu.CheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onCheckedChange={() => {
                onToggle(option.value);
              }}
              // Multi-select menus stay open so several options can be ticked in one visit.
              onSelect={(e) => {
                if (!single) e.preventDefault();
              }}
              className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg pr-3 pl-2 text-sm outline-none select-none data-highlighted:bg-sunken"
            >
              <span
                className="grid size-5 place-items-center rounded-md border border-line-strong data-[on=true]:border-on-maize/20 data-[on=true]:bg-maize"
                data-on={selected.includes(option.value)}
              >
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden="true" className="size-3.5 text-on-maize" strokeWidth={3} />
                </DropdownMenu.ItemIndicator>
              </span>
              {option.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
