import { buttonClass } from './ui/button-class';

// Shared Tailwind classes for form controls and page cards.
export const inputClass =
  'block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink shadow-card placeholder:text-ink-3';
export const primaryButton = buttonClass({ variant: 'primary' }, 'px-5');
export const secondaryButton = buttonClass({ variant: 'secondary' });
export const card = 'rounded-card border border-line bg-surface p-5 shadow-card sm:p-6';
export const linkClass = 'font-medium text-ink underline underline-offset-2 hover:decoration-maize';
