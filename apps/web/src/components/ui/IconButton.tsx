import type { ButtonHTMLAttributes } from 'react';
import { iconButtonClass, type ButtonStyle } from './button-class';

/** An icon-only button. The label is required: it is the button's only name. */
export function IconButton({
  label,
  variant,
  size,
  className,
  ...props
}: ButtonStyle & { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={iconButtonClass({ variant, size }, className)}
      {...props}
    />
  );
}
