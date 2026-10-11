import * as Switch from '@radix-ui/react-switch';
import { useId } from 'react';
import { cx } from './cx';

/** A labelled on/off switch. */
export function Toggle({
  label,
  checked,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string | undefined;
}) {
  const id = useId();
  return (
    <div className={cx('inline-flex h-9 shrink-0 items-center gap-2', className)}>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className={cx(
          'relative h-5.5 w-9.5 shrink-0 rounded-full border transition-colors',
          checked ? 'border-primary bg-primary' : 'border-line-strong bg-sunken',
        )}
      >
        <Switch.Thumb
          className={cx(
            'block size-4 rounded-full shadow-card transition-transform',
            checked ? 'translate-x-4.5 bg-on-primary' : 'translate-x-0.5 bg-ink-3',
          )}
        />
      </Switch.Root>
      <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink select-none">
        {label}
      </label>
    </div>
  );
}
