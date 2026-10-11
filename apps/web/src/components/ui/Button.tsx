import type { ButtonHTMLAttributes } from 'react';
import { buttonClass, type ButtonStyle } from './button-class';

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonStyle & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass({ variant, size }, className)} {...props} />;
}
