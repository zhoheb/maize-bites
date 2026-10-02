import cron from 'node-cron';

export interface Job {
  name: string;
  /** node-cron expression, evaluated in `timezone`. */
  schedule: string;
  /** Also run once right after starting. The job itself decides whether it's due. */
  runOnStart?: boolean;
  run: () => Promise<unknown>;
}

export type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

/**
 * A cron expression that fires every `minutes`. Cron steps only divide evenly within an hour or
 * a day, so `minutes` must divide 60, or be whole hours that divide 24. Anything else throws.
 */
export function everyMinutesCron(minutes: number): string {
  if (Number.isInteger(minutes) && minutes >= 1 && minutes < 60 && 60 % minutes === 0)
    return minutes === 1 ? '* * * * *' : `*/${minutes} * * * *`;
  const hours = minutes / 60;
  if (Number.isInteger(hours) && hours >= 1 && hours <= 24 && 24 % hours === 0)
    return hours === 1 ? '0 * * * *' : hours === 24 ? '0 0 * * *' : `0 */${hours} * * *`;
  throw new Error(
    `Unsupported interval ${minutes} min: use a divisor of 60, or whole hours that divide 24`,
  );
}

export function isSupportedInterval(minutes: number): boolean {
  try {
    everyMinutesCron(minutes);
    return true;
  } catch {
    return false;
  }
}

export interface Scheduler {
  /** Stops scheduling new runs and resolves once in-flight runs finish. */
  stop: () => Promise<void>;
}

type ScheduleFn = (
  expression: string,
  fn: () => void,
  options: { name: string; timezone: string },
) => { stop: () => void | Promise<void> };

export interface SchedulerOptions {
  logger?: Logger;
  timezone?: string;
  /** Injected in tests. */
  scheduleFn?: ScheduleFn;
}

/**
 * Runs jobs on cron schedules. A job never overlaps itself: a tick that fires while the
 * previous run is still going is skipped. A failing run is logged and doesn't stop future runs.
 */
export function startScheduler(jobs: readonly Job[], options: SchedulerOptions = {}): Scheduler {
  const { logger = console, timezone = 'America/Detroit', scheduleFn = cron.schedule } = options;
  const tasks: { stop: () => void | Promise<void> }[] = [];
  const inFlight = new Set<Promise<void>>();
  let stopped = false;

  for (const job of jobs) {
    if (!cron.validate(job.schedule))
      throw new Error(`Invalid cron expression for ${job.name}: ${job.schedule}`);
    let running = false;

    const tick = (): void => {
      if (stopped) return;
      if (running) {
        logger.warn(`[worker] job "${job.name}" still running; skipping this tick`);
        return;
      }
      running = true;
      const run: Promise<void> = job
        .run()
        .then(
          () => undefined,
          (error: unknown) => {
            logger.error(`[worker] job "${job.name}" failed`, error);
          },
        )
        .finally(() => {
          running = false;
          inFlight.delete(run);
        });
      inFlight.add(run);
    };

    tasks.push(scheduleFn(job.schedule, tick, { name: job.name, timezone }));
    if (job.runOnStart) tick();
  }

  return {
    stop: async () => {
      stopped = true;
      for (const task of tasks) await task.stop();
      await Promise.all(inFlight);
    },
  };
}
