import { cx } from './cx';

const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  maize: 'bg-maize text-on-maize hover:brightness-95',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
} as const;

const SIZES = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  icon: 'size-10',
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
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,opacity,filter] disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}
