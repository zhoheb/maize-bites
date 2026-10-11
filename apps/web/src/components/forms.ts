import { buttonClass } from './ui/button-class';

// Shared Tailwind classes for form pages: a centred column, a panel card, clear labels.
export const formPage = 'mx-auto max-w-[35rem] px-4 py-10';
export const inputClass =
  'block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink placeholder:text-ink-3';
export const labelClass = 'block text-sm font-semibold text-ink';
export const helpClass = 'mt-1.5 text-sm text-ink-3';
export const primaryButton = buttonClass({ variant: 'primary' }, 'px-5');
export const secondaryButton = buttonClass({ variant: 'secondary' });
export const card = 'rounded-panel border border-line bg-panel p-5 shadow-card sm:p-7';
export const linkClass = 'font-medium text-ink underline underline-offset-2 hover:decoration-maize';
