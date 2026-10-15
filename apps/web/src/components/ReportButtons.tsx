import type { EventDetail, ReportKind } from '@maize-bites/shared';
import { ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../api/account';
import { ApiRequestError } from '../api/client';
import { useReport } from '../api/crowd';
import { useNow } from '../hooks/useNow';
import { formatRelative } from '../lib/format';
import { cx } from './ui/cx';

const SIGNALS: { kind: ReportKind; label: string; Icon: LucideIcon }[] = [
  { kind: 'still_food', label: 'Still food', Icon: ThumbsUp },
  { kind: 'food_gone', label: "Food's gone", Icon: ThumbsDown },
];
const CORRECTIONS: { kind: ReportKind; label: string }[] = [
  { kind: 'not_free', label: 'Not free' },
  { kind: 'wrong_audience', label: 'Wrong audience' },
  { kind: 'wrong_info', label: 'Wrong info' },
];

const reportsLabel = (label: string, count: number) =>
  `${label}, ${count} ${count === 1 ? 'report' : 'reports'}`;

/**
 * Live crowd signals: signed-in people say whether there is still food, everyone sees the
 * counts and how recent the last report is. Counts update the moment a button is pressed.
 */
export function ReportButtons({
  event,
}: {
  event: Pick<EventDetail, 'id' | 'reportCounts' | 'lastReportAt'>;
}) {
  const me = useMe();
  const report = useReport(event.id);
  const now = useNow();
  const [sent, setSent] = useState<ReportKind | null>(null);
  const signedIn = me.isSuccess && me.data !== null;
  const disabled = !signedIn || report.isPending;
  const send = (kind: ReportKind) => {
    setSent(kind);
    report.mutate(kind, {
      onError: () => {
        setSent(null);
      },
    });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p id="report-heading" className="font-medium text-ink">
          Is there still food?
        </p>
        {event.lastReportAt && (
          <p className="tabular text-xs text-ink-3">
            Last report{' '}
            <time dateTime={event.lastReportAt}>
              {formatRelative(new Date(event.lastReportAt), now)}
            </time>
          </p>
        )}
      </div>
      <div role="group" aria-labelledby="report-heading" className="mt-2.5 grid grid-cols-2 gap-2">
        {SIGNALS.map(({ kind, label, Icon }) => {
          const count = event.reportCounts[kind];
          const pressed = sent === kind;
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              aria-pressed={pressed}
              aria-label={reportsLabel(label, count)}
              onClick={() => {
                send(kind);
              }}
              className={cx(
                'flex min-h-12 items-center justify-between gap-2 rounded-card border px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                pressed
                  ? kind === 'still_food'
                    ? 'border-now bg-now-soft text-now-ink'
                    : 'border-line-strong bg-sunken text-ink'
                  : 'border-line-strong bg-card text-ink hover:bg-sunken',
              )}
            >
              <span className="flex items-center gap-2">
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </span>
              <span className="tabular text-ink-2">{count}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-2">
        Something off?
        {CORRECTIONS.map(({ kind, label }) => {
          const count = event.reportCounts[kind];
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              aria-pressed={sent === kind}
              aria-label={reportsLabel(label, count)}
              onClick={() => {
                send(kind);
              }}
              className="tabular min-h-8 rounded-full border border-line px-2.5 font-medium text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-ink aria-pressed:font-semibold"
            >
              {label} · {count}
            </button>
          );
        })}
      </p>
      <p role="status" className="mt-2 min-h-5 text-sm text-ink-2">
        {!signedIn && me.isSuccess && (
          <>
            <Link to="/sign-in" className="font-semibold text-ink underline underline-offset-2">
              Sign in
            </Link>{' '}
            to report.
          </>
        )}
        {signedIn && sent !== null && report.isSuccess && 'Thanks, your report was counted.'}
      </p>
      {report.isError && (
        <p role="alert" className="mt-1 text-sm font-medium text-danger">
          {report.error instanceof ApiRequestError && report.error.status === 429
            ? 'You are reporting too fast. Try again in a bit.'
            : "Couldn't send your report. Try again."}
        </p>
      )}
    </div>
  );
}
