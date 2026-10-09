import type { EventDetail, ReportKind } from '@maize-bites/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../api/account';
import { ApiRequestError } from '../api/client';
import { useReport } from '../api/crowd';
import { secondaryButton } from './forms';

const KINDS: { kind: ReportKind; label: string }[] = [
  { kind: 'food_gone', label: "Food's gone" },
  { kind: 'still_food', label: 'Still food' },
  { kind: 'not_free', label: 'Not free' },
  { kind: 'wrong_info', label: 'Wrong info' },
];

/** Lets signed-in people say whether the listing is still right, with everyone's counts. */
export function ReportButtons({ event }: { event: Pick<EventDetail, 'id' | 'reportCounts'> }) {
  const me = useMe();
  const report = useReport(event.id);
  const [sent, setSent] = useState<ReportKind | null>(null);
  const signedIn = me.isSuccess && me.data !== null;

  return (
    <section aria-labelledby="report-heading" className="mt-6">
      <h3 id="report-heading" className="text-sm font-semibold text-slate-900">
        Were you there?
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {KINDS.map(({ kind, label }) => {
          const count = event.reportCounts[kind];
          return (
            <li key={kind}>
              <button
                type="button"
                className={secondaryButton}
                disabled={!signedIn || report.isPending}
                aria-pressed={sent === kind}
                aria-label={`${label}, ${count} ${count === 1 ? 'report' : 'reports'}`}
                onClick={() => {
                  report.mutate(kind, {
                    onSuccess: () => {
                      setSent(kind);
                    },
                  });
                }}
              >
                {label}
                <span className="ml-2 rounded-full bg-slate-100 px-2 text-xs text-slate-700">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className="mt-2 text-sm text-slate-600">
        {!signedIn && me.isSuccess && (
          <>
            <Link to="/sign-in" className="font-semibold text-michigan-blue underline">
              Sign in
            </Link>{' '}
            to report.
          </>
        )}
        {signedIn && sent !== null && !report.isError && 'Thanks, your report was counted.'}
      </p>
      {report.isError && (
        <p role="alert" className="mt-1 text-sm font-medium text-red-700">
          {report.error instanceof ApiRequestError && report.error.status === 429
            ? 'You are reporting too fast. Try again in a bit.'
            : "Couldn't send your report. Try again."}
        </p>
      )}
    </section>
  );
}
