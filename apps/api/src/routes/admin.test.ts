import { users } from '@maize-bites/db';
import { apiErrorSchema } from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApi, type TestApi } from '../test/seed.js';

let api: TestApi;

beforeEach(async () => {
  api = await createTestApi();
});
afterEach(async () => {
  await api.handle.close();
});

async function signIn(email: string): Promise<string> {
  await request(api.app).post('/api/auth/magic-link').send({ email });
  const token = /token=([A-Za-z0-9_-]{43})/.exec(api.outbox.at(-1)?.text ?? '')?.[1] ?? '';
  const res = await request(api.app).get('/api/auth/verify').query({ token });
  return ((res.headers['set-cookie'] as unknown as string[])[0] ?? '').split(';')[0] ?? '';
}

const ID = '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11';
const ADMIN_ROUTES = [
  ['get', '/api/admin/review-queue'],
  ['post', `/api/admin/events/${ID}/override`],
  ['post', `/api/admin/submissions/${ID}`],
  ['get', '/api/admin/metrics'],
] as const;

describe('admin routes require an admin', () => {
  it.each(ADMIN_ROUTES)('401 when signed out: %s %s', async (method, path) => {
    const res = await request(api.app)[method](path);
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('unauthorized');
  });

  it.each(ADMIN_ROUTES)('403 for a non-admin: %s %s', async (method, path) => {
    const cookie = await signIn('wolverine@umich.edu');
    const res = await request(api.app)[method](path).set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'forbidden',
      message: 'Admins only',
    });
  });

  it.each(ADMIN_ROUTES)('admins reach the stub (501): %s %s', async (method, path) => {
    await api.handle.db.insert(users).values({ email: 'admin@umich.edu', isAdmin: true });
    const cookie = await signIn('admin@umich.edu');
    const res = await request(api.app)[method](path).set('Cookie', cookie);
    expect(res.status).toBe(501);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'not_implemented',
      message: `${method.toUpperCase()} ${path} is not implemented yet`,
    });
  });
});
