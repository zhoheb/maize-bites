import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cx } from './cx';

/**
 * A single-choice segmented control on a sunken track (Radix toggle group: one tab stop, arrow
 * keys move). The chosen segment is ink, not maize: maize is kept for pins and selection.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string | undefined;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        // Radix sends "" when the active item is pressed again; one option always stays chosen.
        const option = options.find((o) => o.value === next);
        if (option) onChange(option.value);
      }}
      className={cx('inline-flex rounded-full bg-sunken p-1', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cx(
            'h-8 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors sm:px-3.5',
            option.value === value
              ? 'bg-active text-on-active shadow-card'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
