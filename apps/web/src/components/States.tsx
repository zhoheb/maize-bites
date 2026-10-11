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

/** Nothing to show: said plainly in type alone, with somewhere to go next. */
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
    <div data-empty-state className="px-1 py-10">
      <p className="font-display text-2xl leading-8 font-bold tracking-[-0.02em] text-ink">
        {title}
      </p>
      {children && <div className="mt-1.5 max-w-sm text-sm leading-5 text-ink-2">{children}</div>}
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className={buttonClass({
                variant: action.primary ? 'primary' : 'secondary',
                size: 'sm',
              })}
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
      className="rounded-card border border-danger/40 bg-danger-soft px-4 py-3.5 text-sm text-danger"
    >
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Shown over the loading skeleton when the first request is taking long or has already failed
 * once: the API host sleeps when idle and needs up to a minute to wake. Says so, instead of
 * leaving a silent skeleton or showing an error for something that fixes itself.
 */
export function WakingNotice() {
  return (
    <p
      role="status"
      className="mt-3 flex items-start gap-2.5 rounded-card bg-sunken px-3.5 py-2.5 text-[0.8125rem] leading-[1.125rem] text-ink-2"
    >
      <span aria-hidden="true" className="relative mt-1 flex size-2 shrink-0">
        <span className="absolute inset-0 animate-ring rounded-full bg-soon" />
        <span className="relative size-2 rounded-full bg-soon" />
      </span>
      <span>
        <strong className="font-semibold text-ink">Waking up the server.</strong> After a quiet
        spell the first visit takes up to a minute. This page will fill in by itself.
      </span>
    </p>
  );
}

/** A slim line above a list that came from this device's saved copy. */
export function OfflineBanner({ savedAt }: { savedAt: string }) {
  return (
    <p
      role="status"
      className="tabular mt-3 flex items-center gap-2 rounded-full bg-soon-soft px-3.5 py-1.5 text-[0.8125rem] font-medium text-soon-ink"
    >
      <WifiOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      Offline — showing data from {savedAt}
    </p>
  );
}
