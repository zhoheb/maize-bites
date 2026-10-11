import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cx } from './cx';

/**
 * A single-choice segmented control (Radix toggle group: one tab stop, arrow keys move). The
 * active segment is maize.
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
      className={cx('inline-flex rounded-full border border-line bg-sunken p-1', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cx(
            'min-h-9 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors',
            option.value === value
              ? 'bg-maize text-on-maize shadow-card'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
