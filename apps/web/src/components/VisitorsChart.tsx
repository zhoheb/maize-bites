import type { DayStats } from '@maize-bites/shared';
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatCount, formatDay, niceMax } from '../lib/analytics';

// Daily unique visitors and page views on one shared count axis. Hand-written SVG: two 2px
// lines, a faint wash under visitors, hairline gridlines, a legend, end labels when they don't
// collide, and a crosshair + tooltip on hover or arrow keys. The table view carries every value.

const W = 640;
const H = 220;
const M = { top: 12, right: 44, bottom: 26, left: 40 };
const INNER_W = W - M.left - M.right;
const INNER_H = H - M.top - M.bottom;

const SERIES = [
  {
    key: 'uniqueVisitors',
    label: 'Unique visitors',
    stroke: 'stroke-chart-1',
    fill: 'fill-chart-1',
    bg: 'bg-chart-1',
  },
  {
    key: 'pageViews',
    label: 'Page views',
    stroke: 'stroke-chart-2',
    fill: 'fill-chart-2',
    bg: 'bg-chart-2',
  },
] as const;

export function VisitorsChart({ series }: { series: DayStats[] }) {
  const [active, setActive] = useState<number | null>(null);
  const n = series.length;
  const max = niceMax(Math.max(0, ...series.map((d) => d.pageViews)));
  const x = (i: number) => M.left + (n <= 1 ? INNER_W : (i / (n - 1)) * INNER_W);
  const y = (v: number) => M.top + INNER_H * (1 - v / max);
  const line = (key: (typeof SERIES)[number]['key']) =>
    series
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`)
      .join('');
  const area = `${line('uniqueVisitors')}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const ticks = [0, max / 2, max];
  const last = series.at(-1);
  const endGap = last ? Math.abs(y(last.uniqueVisitors) - y(last.pageViews)) : 0;

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((svgX - M.left) / INNER_W) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };
  const step = (e: KeyboardEvent<SVGSVGElement>) => {
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    setActive((current) => Math.min(n - 1, Math.max(0, (current ?? n - 1) + delta)));
  };
  const hovered = active === null ? undefined : series[active];

  return (
    <figure className="m-0">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-0.5 w-4 rounded-full ${s.bg}`} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          className="block h-auto w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-lg"
          role="img"
          aria-label={`Daily unique visitors and page views, ${formatDay(series[0]?.day ?? '')} to ${formatDay(last?.day ?? '')}. Use the arrow keys for each day, or the table below.`}
          tabIndex={0}
          onPointerMove={pick}
          onPointerLeave={() => {
            setActive(null);
          }}
          onKeyDown={step}
          onBlur={() => {
            setActive(null);
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink-3 text-[11px] tabular-nums"
              >
                {formatCount(t)}
              </text>
            </g>
          ))}
          {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              className="fill-ink-3 text-[11px]"
            >
              {formatDay(series[i]?.day ?? '')}
            </text>
          ))}
          <path d={area} className="fill-chart-1" fillOpacity={0.1} />
          {SERIES.map((s) => (
            <path
              key={s.key}
              d={line(s.key)}
              fill="none"
              className={s.stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {last &&
            SERIES.map((s) => (
              <g key={s.key}>
                <circle
                  cx={x(n - 1)}
                  cy={y(last[s.key])}
                  r={4}
                  className={`${s.fill} stroke-card`}
                  strokeWidth={2}
                />
                {endGap >= 14 && (
                  <text
                    x={x(n - 1) + 8}
                    y={y(last[s.key])}
                    dy="0.32em"
                    className="fill-ink-2 text-[11px] tabular-nums"
                  >
                    {formatCount(last[s.key])}
                  </text>
                )}
              </g>
            ))}
          {hovered && active !== null && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={M.top}
                y2={M.top + INNER_H}
                className="stroke-line-strong"
                strokeWidth={1}
              />
              {SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={x(active)}
                  cy={y(hovered[s.key])}
                  r={4.5}
                  className={`${s.fill} stroke-card`}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>
        {hovered && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-card"
            style={
              x(active) > W / 2
                ? { right: `${String(((W - x(active)) / W) * 100 + 2)}%` }
                : { left: `${String((x(active) / W) * 100 + 2)}%` }
            }
          >
            <p className="font-semibold text-ink">{formatDay(hovered.day)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
                <span aria-hidden="true" className={`h-0.5 w-3 rounded-full ${s.bg}`} />
                {s.label}:{' '}
                <span className="font-semibold text-ink tabular-nums">
                  {formatCount(hovered[s.key])}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
