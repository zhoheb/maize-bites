import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  everyMinutesCron,
  isSupportedInterval,
  startScheduler,
  type Job,
  type SchedulerOptions,
} from './scheduler.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Captures scheduled callbacks so tests can fire ticks by hand. */
function fakeCron() {
  const ticks = new Map<string, () => void>();
  const stop = vi.fn();
  const scheduleFn = vi.fn<NonNullable<SchedulerOptions['scheduleFn']>>((_expr, fn, { name }) => {
    ticks.set(name, fn);
    return { stop };
  });
  return { scheduleFn, stop, tick: (name = 'test') => ticks.get(name)?.() };
}

/** A job whose runs stay pending until finish() is called. */
function controllableJob(overrides: Partial<Job> = {}) {
  const pending: (() => void)[] = [];
  const run = vi.fn(() => new Promise<void>((resolve) => pending.push(resolve)));
  return {
    job: { name: 'test', schedule: '23 * * * *', run, ...overrides },
    run,
    finish: () => pending.shift()?.(),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  logger.info.mockReset();
  logger.warn.mockReset();
  logger.error.mockReset();
});

describe('startScheduler', () => {
  it('registers each job with its cron expression in America/Detroit', async () => {
    const cron = fakeCron();
    const scheduler = startScheduler([{ name: 'test', schedule: '23 * * * *', run: vi.fn() }], {
      logger,
      scheduleFn: cron.scheduleFn,
    });

    expect(cron.scheduleFn).toHaveBeenCalledWith('23 * * * *', expect.any(Function), {
      name: 'test',
      timezone: 'America/Detroit',
    });
    await scheduler.stop();
  });

  it('rejects invalid cron expressions', () => {
    expect(() =>
      startScheduler([{ name: 'bad', schedule: 'every hour', run: vi.fn() }], { logger }),
    ).toThrow(/Invalid cron/);
  });

  it('runs on each tick, and immediately when runOnStart is set', async () => {
    const cron = fakeCron();
    const run = vi.fn(() => Promise.resolve());
    const scheduler = startScheduler(
      [{ name: 'test', schedule: '0 * * * *', runOnStart: true, run }],
      {
        logger,
        scheduleFn: cron.scheduleFn,
      },
    );
    expect(run).toHaveBeenCalledTimes(1);

    await flush();
    cron.tick();
    await flush();
    cron.tick();
    expect(run).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });

  it('skips ticks while the previous run is still in flight', async () => {
    const cron = fakeCron();
    const { job, run, finish } = controllableJob();
    const scheduler = startScheduler([job], { logger, scheduleFn: cron.scheduleFn });

    cron.tick();
    cron.tick();
    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('still running'));

    finish();
    await flush();
    cron.tick();
    expect(run).toHaveBeenCalledTimes(2);

    finish();
    await scheduler.stop();
  });

  it('logs failures and keeps scheduling', async () => {
    const cron = fakeCron();
    const run = vi.fn(() => Promise.reject(new Error('boom')));
    const scheduler = startScheduler([{ name: 'test', schedule: '0 * * * *', run }], {
      logger,
      scheduleFn: cron.scheduleFn,
    });

    cron.tick();
    await flush();
    cron.tick();
    await flush();

    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('stop() stops cron tasks, waits for in-flight runs, and ignores later ticks', async () => {
    const cron = fakeCron();
    const { job, run, finish } = controllableJob();
    const scheduler = startScheduler([job], { logger, scheduleFn: cron.scheduleFn });
    cron.tick();

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await flush();
    expect(cron.stop).toHaveBeenCalled();
    expect(stopped).toBe(false);

    finish();
    await stopping;
    expect(stopped).toBe(true);

    cron.tick();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('everyMinutesCron', () => {
  it.each([
    [1, '* * * * *'],
    [5, '*/5 * * * *'],
    [30, '*/30 * * * *'],
    [60, '0 * * * *'],
    [120, '0 */2 * * *'],
    [720, '0 */12 * * *'],
    [1440, '0 0 * * *'],
  ])('%i min → %s', (minutes, expected) => {
    expect(everyMinutesCron(minutes)).toBe(expected);
    expect(isSupportedInterval(minutes)).toBe(true);
  });

  it.each([0, -5, 7, 45, 90, 300, 2880, 1.5])('rejects %d min', (minutes) => {
    expect(() => everyMinutesCron(minutes)).toThrow(/Unsupported interval/);
    expect(isSupportedInterval(minutes)).toBe(false);
  });
});
