import { describe, expect, it } from 'vitest';
import { createPinoLogger, toJobLogger } from './logger.js';

function capture(level: 'info' | 'warn' | 'silent' = 'info') {
  const lines: Record<string, unknown>[] = [];
  const pino = createPinoLogger(
    { NODE_ENV: 'production', LOG_LEVEL: level },
    { write: (line: string) => lines.push(JSON.parse(line) as Record<string, unknown>) },
  );
  return { pino, logger: toJobLogger(pino), lines };
}

describe('worker logger', () => {
  it('writes JSON lines with the app name, level, and message', () => {
    const { logger, lines } = capture();
    logger.info('scheduler started');
    expect(lines).toEqual([
      expect.objectContaining({ app: 'worker', level: 30, msg: 'scheduler started' }),
    ]);
    expect(lines[0]).not.toHaveProperty('component');
    expect(lines[0]).not.toHaveProperty('details');
  });

  it('turns a leading [tag] into a component field', () => {
    const { logger, lines } = capture();
    logger.warn('[ingest] happening: fetch failed: HTTP 403');
    logger.info('[email:dev] to=a@umich.edu');
    expect(lines[0]).toMatchObject({
      level: 40,
      component: 'ingest',
      msg: 'happening: fetch failed: HTTP 403',
    });
    expect(lines[1]).toMatchObject({ component: 'email:dev', msg: 'to=a@umich.edu' });
  });

  it('logs an Error argument as err with its stack, and other arguments as details', () => {
    const { logger, lines } = capture();
    logger.error('[worker] job "ingest" failed', new Error('db hiccup'), { attempt: 2 });
    expect(lines[0]).toMatchObject({
      level: 50,
      component: 'worker',
      msg: 'job "ingest" failed',
      err: { type: 'Error', message: 'db hiccup' },
      details: [{ attempt: 2 }],
    });
    expect((lines[0]?.['err'] as { stack: string }).stack).toContain('logger.test.ts');
  });

  it('honors LOG_LEVEL', () => {
    const warnOnly = capture('warn');
    warnOnly.logger.info('quiet');
    warnOnly.logger.warn('loud');
    expect(warnOnly.lines.map((l) => l['msg'])).toEqual(['loud']);

    const silent = capture('silent');
    silent.logger.error('nothing');
    expect(silent.lines).toEqual([]);
  });

  it('redacts credentials the same way the API does', () => {
    const { pino, lines } = capture();
    pino.info({ user: { token: 'abc', password: 'hunter2', email: 'a@umich.edu' } }, 'signed in');
    expect(lines[0]?.['user']).toEqual({
      token: '[redacted]',
      password: '[redacted]',
      email: 'a@umich.edu',
    });
  });
});
