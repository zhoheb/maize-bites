import { readFileSync } from 'node:fs';
import { CAMPUS_TIME_ZONE, wallTimeOf } from '@maize-bites/shared';
import { describe, expect, it, vi } from 'vitest';
import { morningIngestJob, windowJob } from './index.js';
import type { IngestDeps } from './ingest.js';
import { isDigestRunForToday } from './once.js';
import {
  MORNING_INGEST_CRON,
  WINDOW_CRON,
  WINDOW_LOCAL_HOURS,
  isHousekeepingRun,
  isIngestRun,
} from './schedule.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const workflow = readFileSync(
  new URL('../../../../.github/workflows/ingest.yml', import.meta.url),
  'utf8',
);
const crons = [...workflow.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1] ?? '');

const expandField = (field: string): number[] =>
  field.split(',').flatMap((part) => {
    const [from = 0, to = from] = part.split('-').map(Number);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });

/** Every firing of the workflow's crons on one UTC date, with the run's decisions. */
function firings(date: number) {
  return crons.flatMap((cron) => {
    const [minutes = '', hours = ''] = cron.split(' ');
    return expandField(hours).flatMap((hour) =>
      expandField(minutes).map((minute) => {
        const at = new Date(date + hour * HOUR + minute * 60_000);
        return { cron, at, local: wallTimeOf(at, CAMPUS_TIME_ZONE) };
      }),
    );
  });
}

const stamp = (local: { hour: number; minute: number }) =>
  `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;

/** What a normal Ann Arbor day should run, in order. */
const EXPECTED_DAY = [
  '02:05',
  '05:05',
  '07:00',
  ...Array.from({ length: 16 }, (_, i) => `${String(i + 8)}:05`.padStart(5, '0')),
];

describe('ingest.yml against the schedule', () => {
  // A UTC date's firings straddle two local dates; group by local date to compare whole days.
  function localDays(fromUtc: string, days: number) {
    const start = Date.parse(fromUtc);
    const byDay = new Map<string, { time: string; cron: string; at: Date }[]>();
    for (let i = 0; i < days; i += 1)
      for (const { cron, at, local } of firings(start + i * DAY)) {
        if (!isIngestRun(cron, at)) continue;
        const key = `${local.year}-${local.month}-${local.day}`;
        byDay.set(key, [...(byDay.get(key) ?? []), { time: stamp(local), cron, at }]);
      }
    return [...byDay.entries()].slice(1, -1); // the first and last are partial
  }

  // The two days a year the clocks change have an hour more or less; everything else must match.
  const clockChange = (key: string) => key === '2026-3-8' || key === '2026-11-1';

  it('runs exactly the planned windows on every ordinary day of the year', () => {
    const days = localDays('2026-01-01T00:00:00Z', 365);
    expect(days.length).toBeGreaterThan(360);
    for (const [key, runs] of days) {
      if (clockChange(key)) continue;
      expect([key, runs.map((r) => r.time).sort()]).toEqual([key, EXPECTED_DAY]);
    }
  });

  it('never leaves more than 3 hours between windows overnight, or 1 by day', () => {
    const times = EXPECTED_DAY.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
    const gaps = times.slice(1).map((t, i) => t - (times[i] ?? 0));
    gaps.push((times[0] ?? 0) + 24 * 60 - (times.at(-1) ?? 0));
    expect(Math.max(...gaps)).toBe(180);
    const daytime = times.filter((t) => t >= 7 * 60 && t < 23 * 60);
    expect(daytime[0]).toBe(7 * 60);
    expect(daytime.slice(1).every((t, i) => t - (daytime[i] ?? 0) <= 65)).toBe(true);
  });

  it('ingests at 7:00 AM all year, before the 7:30 digest', () => {
    for (const utc of ['2026-07-15T00:00:00Z', '2026-01-15T00:00:00Z']) {
      const times = firings(Date.parse(utc))
        .filter((f) => isIngestRun(f.cron, f.at))
        .map((f) => stamp(f.local));
      expect(times).toContain('07:00');
    }
    expect(isDigestRunForToday('30 11 * * *', new Date('2026-07-15T11:30:00Z'))).toBe(true);
  });

  it('runs housekeeping once a day, in the 5:05 AM window, all year', () => {
    for (const [key, runs] of localDays('2026-01-01T00:00:00Z', 365)) {
      const kept = runs.filter((r) => isHousekeepingRun(r.cron, r.at));
      expect([key, kept.map((r) => r.time)]).toEqual([key, ['05:05']]);
    }
  });

  it('keeps the decision when GitHub starts a run hours late', () => {
    const fired = '5 9 * * *'; // 5:05 AM in summer, 4:05 AM in winter
    expect(isIngestRun(fired, new Date('2026-07-15T14:40:00Z'))).toBe(true);
    expect(isHousekeepingRun(fired, new Date('2026-07-15T14:40:00Z'))).toBe(true);
    expect(isIngestRun(fired, new Date('2026-01-15T14:40:00Z'))).toBe(false);
    expect(isHousekeepingRun(fired, new Date('2026-01-15T14:40:00Z'))).toBe(false);
  });

  it('always runs a manual ingest and a manual cleanup', () => {
    const now = new Date('2026-07-15T09:00:00Z');
    expect(isIngestRun(undefined, now)).toBe(true);
    expect(isIngestRun('', now)).toBe(true);
    expect(isHousekeepingRun(undefined, now)).toBe(true);
    expect(isHousekeepingRun('', now)).toBe(true);
  });
});

describe("the worker's schedule", () => {
  it('uses the same hours as the plan, ingesting at 7:00 AM', () => {
    expect(WINDOW_CRON).toBe('5 2,5,8-23 * * *');
    expect(expandField(WINDOW_CRON.split(' ')[1] ?? '')).toEqual([...WINDOW_LOCAL_HOURS]);
    expect(MORNING_INGEST_CRON).toBe('0 7 * * *');
  });

  const ingesting = (order: string[]) =>
    ({
      db: {} as IngestDeps['db'],
      sources: [],
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      classify: () => {
        order.push('classify');
        return Promise.reject(new Error('stop after classify'));
      },
    }) as unknown as IngestDeps;

  const step = (order: string[], name: string) => ({
    name,
    run: () => {
      order.push(name);
      return Promise.resolve();
    },
  });

  it('puts every job in one window: ingest, then housekeeping, one after the other', async () => {
    const order: string[] = [];
    const job = windowJob(
      ingesting(order),
      [step(order, 'auth'), step(order, 'prune')],
      () => new Date('2026-07-15T09:05:00Z'), // 5:05 AM
    );
    await job.run().catch(() => undefined);
    expect(job.schedule).toBe(WINDOW_CRON);
    expect(order).toEqual(['classify', 'auth', 'prune']);
  });

  it('skips housekeeping in the other windows', async () => {
    const order: string[] = [];
    const job = windowJob(
      ingesting(order),
      [step(order, 'auth')],
      () => new Date('2026-07-15T16:05:00Z'), // noon
    );
    await job.run().catch(() => undefined);
    expect(order).toEqual(['classify']);
  });

  it('has a separate 7:00 AM ingestion', () => {
    expect(morningIngestJob(ingesting([])).schedule).toBe('0 7 * * *');
  });
});
