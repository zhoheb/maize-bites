import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function EmptyState({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; to: string } | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <svg aria-hidden="true" viewBox="0 0 48 48" className="mx-auto size-12">
        <circle cx="24" cy="25" r="15" className="fill-maize" />
        <circle cx="36" cy="14" r="6" className="fill-white" />
        <circle cx="31" cy="10" r="4" className="fill-white" />
      </svg>
      <p className="mt-3 text-base font-semibold text-michigan-blue">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-600">{children}</div>}
      {action && (
        <Link
          to={action.to}
          className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-michigan-blue px-4 text-sm font-semibold text-white hover:bg-michigan-blue/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-michigan-blue"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 font-semibold underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-red-900"
        >
          Try again
        </button>
      )}
    </div>
  );
}
