import type { UserRow } from '@maize-bites/db';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../errors.js';
import { readCookie, requireAdmin, requireUser } from './session.js';

function appWith(user: Partial<UserRow> | null) {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  app.use((req, _res, next) => {
    if (user)
      req.user = {
        id: 'u1',
        email: 'a@umich.edu',
        isAdmin: false,
        trustLevel: 0,
        createdAt: new Date(),
        ...user,
      };
    next();
  });
  app.get('/user', requireUser, (_req, res) => res.json({ ok: true }));
  app.get('/admin', requireAdmin, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('requireUser / requireAdmin', () => {
  it.each([
    ['anonymous', null, 401, 401],
    ['signed-in user', { isAdmin: false }, 200, 403],
    ['admin', { isAdmin: true }, 200, 200],
  ] as const)('%s → /user %i, /admin %i', async (_who, user, userStatus, adminStatus) => {
    const app = appWith(user);
    expect((await request(app).get('/user')).status).toBe(userStatus);
    expect((await request(app).get('/admin')).status).toBe(adminStatus);
  });
});

describe('readCookie', () => {
  it.each([
    ['a=1; mb_session=abc; b=2', 'abc'],
    ['mb_session=a%20b', 'a b'],
    ['other=1', null],
    ['mb_session=%E0%A4%A', null],
  ])('%j → %j', (header, value) => {
    expect(readCookie(header, 'mb_session')).toBe(value);
  });

  it('handles a missing header', () => {
    expect(readCookie(undefined, 'mb_session')).toBeNull();
  });
});
