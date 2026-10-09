import { pino, type DestinationStream, type Logger as PinoLogger } from 'pino';
import type { WorkerEnv } from './env.js';
import type { Logger } from './scheduler.js';

// Same level, redaction, and format as the API's logger (apps/api/src/logger.ts). The two apps
// don't share a package for it, so keep the options below in step with that file.

/** Never log credentials. */
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
];

export function createPinoLogger(
  env: Pick<WorkerEnv, 'NODE_ENV' | 'LOG_LEVEL'>,
  /** For tests. Defaults to stdout (pretty-printed in development). */
  destination?: DestinationStream,
): PinoLogger {
  const options = {
    level: env.LOG_LEVEL,
    redact: { paths: REDACT, censor: '[redacted]' },
    base: { app: 'worker' },
  };
  if (destination) return pino(options, destination);
  return pino({
    ...options,
    // Readable logs locally; JSON lines everywhere else.
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}

const COMPONENT = /^\[([a-z][a-z0-9:-]*)\]\s*/i;

/**
 * Adapts pino to the console-shaped Logger the jobs take: `logger.error(message, error)`.
 * A leading "[ingest]"-style tag becomes the `component` field, an Error among the extra
 * arguments becomes `err` (with its stack), and anything else goes under `details`.
 */
export function toJobLogger(logger: PinoLogger): Logger {
  const write =
    (level: 'info' | 'warn' | 'error') =>
    (message?: unknown, ...rest: unknown[]): void => {
      const text = typeof message === 'string' ? message : JSON.stringify(message);
      const tag = COMPONENT.exec(text);
      const err = rest.find((value) => value instanceof Error);
      const details = rest.filter((value) => value !== err);
      logger[level](
        {
          ...(tag ? { component: tag[1] } : {}),
          ...(err ? { err } : {}),
          ...(details.length > 0 ? { details } : {}),
        },
        tag ? text.slice(tag[0].length) : text,
      );
    };
  return { info: write('info'), warn: write('warn'), error: write('error') };
}
