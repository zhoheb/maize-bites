import { cx } from './cx';

const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'border border-line-strong bg-card text-ink hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
} as const;

const SIZES = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-4 text-sm',
} as const;

export interface ButtonStyle {
  variant?: keyof typeof VARIANTS | undefined;
  size?: keyof typeof SIZES | undefined;
}

/** Button classes, for links that should look like buttons. */
export function buttonClass(
  { variant = 'secondary', size = 'md' }: ButtonStyle = {},
  extra?: string,
) {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,opacity] disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

/** A square, icon-only button. Give it an aria-label. */
export function iconButtonClass(
  { variant = 'ghost', size = 'sm' }: ButtonStyle = {},
  extra?: string,
) {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    size === 'sm' ? 'size-9' : 'size-11',
    extra,
  );
}
