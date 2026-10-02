import { pino, type Logger } from 'pino';
import type { ApiEnv } from './env.js';

export type { Logger };

/** Never log credentials, even once auth lands. */
export const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
];

export function createLogger(env: Pick<ApiEnv, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: REDACT, censor: '[redacted]' },
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
