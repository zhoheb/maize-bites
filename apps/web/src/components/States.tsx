import { RefreshCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from './ui/Button';
import { buttonClass } from './ui/button-class';

export interface StateAction {
  label: string;
  to: string;
  primary?: boolean;
}

/** Nothing to show, said plainly, with somewhere to go next. */
export function EmptyState({
  title,
  actions = [],
  children,
}: {
  title: string;
  actions?: readonly StateAction[];
  children?: ReactNode;
}) {
  return (
    <div
      data-empty-state
      className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center"
    >
      <svg aria-hidden="true" viewBox="0 0 64 64" className="mx-auto size-14">
        <ellipse cx="32" cy="40" rx="26" ry="9" className="fill-sunken" />
        <ellipse cx="32" cy="38" rx="20" ry="6" className="fill-surface stroke-line-strong" />
        <path
          d="M24 37c2-2 5-3 8-3"
          className="fill-none stroke-maize"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="41" cy="36" r="1.6" className="fill-maize" />
        <circle cx="36" cy="40" r="1.2" className="fill-maize" />
      </svg>
      <p className="mt-3 font-display text-lg font-bold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-sm text-ink-2">{children}</div>}
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className={buttonClass({ variant: action.primary ? 'primary' : 'secondary' })}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-warn/30 bg-warn-bg px-5 py-4 text-sm text-warn"
    >
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Try again
        </Button>
      )}
    </div>
  );
}

/** Shown above a list that came from this device's saved copy because there is no connection. */
export function OfflineBanner({ savedAt }: { savedAt: string }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2.5 rounded-card border border-amber-line bg-surface px-4 py-3 text-sm text-ink"
    >
      <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber" />
      <span>
        <strong className="font-semibold">You're offline.</strong> This is the list as of {savedAt}.
        Events may have changed or run out since.
      </span>
    </p>
  );
}
