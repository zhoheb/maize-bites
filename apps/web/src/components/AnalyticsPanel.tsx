import type { AdminAnalyticsResponse, AnalyticsRange, Comparison } from '@maize-bites/shared';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useAdminAnalytics, useAnalyticsSettings } from '../api/admin';
import { describeChange, formatCount, formatDay, formatShare, pathLabel } from '../lib/analytics';
import { card } from './forms';
import { ErrorState } from './States';
import { Segmented } from './ui/Segmented';
import { Toggle } from './ui/Toggle';
import { VisitorsChart } from './VisitorsChart';

const RANGES = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const;

const ARROWS = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight };

function Tile({ label, figure, against }: { label: string; figure: Comparison; against: string }) {
  const change = describeChange(figure);
  const Arrow = ARROWS[change.direction];
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-ink">{formatCount(figure.value)}</dd>
      <dd className="mt-0.5 text-xs text-ink-2">
        <Arrow
          aria-hidden="true"
          className="mr-0.5 inline size-3.5 align-[-0.2em]"
          strokeWidth={2}
        />
        {change.text} <span className="text-ink-3">vs {against}</span>
      </dd>
    </div>
  );
}

function TopList({
  title,
  rows,
  empty,
  label = (n: string) => n,
}: {
  title: string;
  rows: AdminAnalyticsResponse['topPages'];
  empty: string;
  label?: (name: string) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate text-ink">{label(r.name)}</span>
                <span className="tabular-nums text-ink-2">{formatCount(r.views)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-sunken">
                <div
                  className="h-1.5 rounded-full bg-chart-1"
                  style={{ width: `${String((r.views / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Funnel({ series }: { series: AdminAnalyticsResponse['series'] }) {
  const visitors = series.reduce((n, d) => n + d.uniqueVisitors, 0);
  const opened = series.reduce((n, d) => n + d.eventVisitors, 0);
  const signups = series.reduce((n, d) => n + d.alertSignups, 0);
  const steps = [
    { label: 'Daily visitors', value: visitors, note: null },
    {
      label: 'Opened an event',
      value: opened,
      note: visitors > 0 ? `${formatShare(opened / visitors)} of daily visitors` : null,
    },
    { label: 'Signed up for alerts', value: signups, note: 'new alert subscribers' },
  ];
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Funnel</h3>
      <ol className="mt-2 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className="rounded-xl bg-sunken px-3 py-2">
            <p className="text-sm text-ink-2">
              <span className="mr-1 text-ink-3 tabular-nums">{i + 1}</span>
              {s.label}
            </p>
            <p className="text-lg font-semibold text-ink">{formatCount(s.value)}</p>
            {s.note && <p className="text-xs text-ink-3">{s.note}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function DeviceSplit({ mobileShare }: { mobileShare: number | null }) {
  if (mobileShare === null) return null;
  const parts = [
    { label: 'Mobile', share: mobileShare, bg: 'bg-chart-1' },
    { label: 'Desktop', share: 1 - mobileShare, bg: 'bg-chart-2' },
  ];
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Devices</h3>
      <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {parts.map(
          (p) =>
            p.share > 0 && (
              <div key={p.label} className={`h-full ${p.bg}`} style={{ flexGrow: p.share }} />
            ),
        )}
      </div>
      <ul className="mt-2 flex gap-4 text-sm text-ink-2">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${p.bg}`} />
            {p.label}{' '}
            <span className="font-semibold text-ink tabular-nums">{formatShare(p.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayTable({ series }: { series: AdminAnalyticsResponse['series'] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-ink">Show as a table</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="sticky top-0 bg-card text-ink-2">
            <tr>
              <th className="py-1 pr-3 font-medium">Day</th>
              <th className="py-1 pr-3 font-medium">Visitors</th>
              <th className="py-1 pr-3 font-medium">Page views</th>
              <th className="py-1 pr-3 font-medium">Signed in</th>
              <th className="py-1 pr-3 font-medium">Opened an event</th>
              <th className="py-1 font-medium">Alert sign-ups</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            {[...series].reverse().map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1 pr-3">{formatDay(d.day)}</td>
                <td className="py-1 pr-3">{d.uniqueVisitors}</td>
                <td className="py-1 pr-3">{d.pageViews}</td>
                <td className="py-1 pr-3">{d.signedInVisitors}</td>
                <td className="py-1 pr-3">{d.eventVisitors}</td>
                <td className="py-1">{d.alertSignups}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Admin: daily unique visitors, counted without cookies (see apps/api/src/analytics.ts). */
export function AnalyticsPanel() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const analytics = useAdminAnalytics(range, true);
  const settings = useAnalyticsSettings();
  const data = analytics.data;

  return (
    <section aria-labelledby="admin-visitors" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="admin-visitors" className="text-lg font-semibold text-ink">
          Visitors
        </h2>
        <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
      </div>

      {analytics.isPending && <p className="mt-3 text-sm text-ink-2">Loading…</p>}
      {analytics.isError && (
        <ErrorState
          message="Couldn't load the visitor numbers."
          onRetry={() => void analytics.refetch()}
        />
      )}
      {data && (
        <div className="mt-4 space-y-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Today" figure={data.tiles.today} against="yesterday" />
            <Tile label="Yesterday" figure={data.tiles.yesterday} against="the day before" />
            <Tile label="7-day average" figure={data.tiles.weekAverage} against="the 7 before" />
            <Tile label="Last 30 days" figure={data.tiles.last30} against="the 30 before" />
          </dl>
          <p className="-mt-3 text-xs text-ink-3">
            Visitor ids change every day by design, so the 30-day figure adds up daily visitors; one
            person visiting on three days counts three times.
          </p>

          <VisitorsChart series={data.series} />
          <DayTable series={data.series} />
          <Funnel series={data.series} />

          <div className="grid gap-6 sm:grid-cols-2">
            <TopList
              title="Top pages"
              rows={data.topPages}
              empty="No page views yet."
              label={pathLabel}
            />
            <TopList
              title="Top referrers"
              rows={data.topReferrers}
              empty="No visits from other sites yet."
            />
          </div>
          <DeviceSplit mobileShare={data.mobileShare} />

          <Toggle
            label="Leave out my own visits"
            checked={data.excludeSelf}
            onChange={(excludeSelf) => {
              settings.mutate({ excludeSelf });
            }}
          />
        </div>
      )}
    </section>
  );
}
