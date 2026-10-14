import { pushSubscriptions, subscriptions } from '@maize-bites/db';
import {
  DEFAULT_ALERT_PREFERENCES,
  alertPreferencesSchema,
  apiErrorSchema,
} from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApi, type TestApi } from '../test/seed.js';

let api: TestApi;
let cookie: string;

beforeEach(async () => {
  api = await createTestApi();
  await request(api.app).post('/api/auth/magic-link').send({ email: 'wolverine@umich.edu' });
  const token = /token=([A-Za-z0-9_-]{43})/.exec(api.outbox.at(-1)?.text ?? '')?.[1] ?? '';
  const res = await request(api.app).get('/api/auth/verify').query({ token });
  cookie = ((res.headers['set-cookie'] as unknown as string[])[0] ?? '').split(';')[0] ?? '';
});
afterEach(async () => {
  await api.handle.close();
});

const prefs = {
  channels: ['email', 'push'],
  campuses: ['north'],
  dietary: ['vegan'],
  openOnly: true,
  mode: 'instant',
  quietHours: { start: '22:00', end: '07:30' },
} as const;

describe('/api/me/subscription', () => {
  it('returns defaults (alerts off) before anything is saved', async () => {
    const res = await request(api.app).get('/api/me/subscription').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_ALERT_PREFERENCES);
  });

  it('saves one preference set per enabled channel and reads it back', async () => {
    const put = await request(api.app)
      .put('/api/me/subscription')
      .set('Cookie', cookie)
      .send(prefs);
    expect(put.status).toBe(200);

    expect(await api.handle.db.$count(subscriptions)).toBe(2);
    const get = await request(api.app).get('/api/me/subscription').set('Cookie', cookie);
    expect(alertPreferencesSchema.parse(get.body)).toEqual(prefs);
  });

  it('turning a channel off deletes its row; turning everything off deletes all', async () => {
    await request(api.app).put('/api/me/subscription').set('Cookie', cookie).send(prefs);
    await request(api.app)
      .put('/api/me/subscription')
      .set('Cookie', cookie)
      .send({ ...prefs, channels: ['push'] });
    expect((await api.handle.db.select().from(subscriptions)).map((r) => r.channel)).toEqual([
      'push',
    ]);

    await request(api.app)
      .put('/api/me/subscription')
      .set('Cookie', cookie)
      .send({ ...prefs, channels: [] });
    expect(await api.handle.db.$count(subscriptions)).toBe(0);
  });

  it.each([
    [{ ...prefs, mode: 'hourly' }, 'mode'],
    [{ ...prefs, campuses: ['dearborn'] }, 'campuses.0'],
    [{ ...prefs, channels: ['sms'] }, 'channels.0'],
    [{ ...prefs, channels: ['email', 'email'] }, 'channels'],
    [{ ...prefs, quietHours: { start: '25:00', end: '07:00' } }, 'quietHours.start'],
    [{ ...prefs, quietHours: { start: '07:00', end: '07:00' } }, 'quietHours'],
  ])('rejects %j', async (body, path) => {
    const res = await request(api.app).put('/api/me/subscription').set('Cookie', cookie).send(body);
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.issues?.map((i) => i.path)).toContain(path);
  });

  it('requires sign-in', async () => {
    expect((await request(api.app).get('/api/me/subscription')).status).toBe(401);
    expect((await request(api.app).put('/api/me/subscription').send(prefs)).status).toBe(401);
  });
});

describe('/api/me/push', () => {
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    expirationTime: null,
    keys: {
      p256dh:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  };

  it('registers, re-registers idempotently, and removes an endpoint', async () => {
    expect(
      (await request(api.app).post('/api/me/push').set('Cookie', cookie).send(sub)).status,
    ).toBe(201);
    expect(
      (await request(api.app).post('/api/me/push').set('Cookie', cookie).send(sub)).status,
    ).toBe(201);
    expect(await api.handle.db.$count(pushSubscriptions)).toBe(1);

    const del = await request(api.app)
      .delete('/api/me/push')
      .set('Cookie', cookie)
      .send({ endpoint: sub.endpoint });
    expect(del.status).toBe(204);
    expect(await api.handle.db.$count(pushSubscriptions)).toBe(0);
  });

  it('stores keys sent in standard base64 as URL-safe base64, and rejects malformed ones', async () => {
    const standard = {
      ...sub,
      keys: {
        p256dh: `${sub.keys.p256dh.replaceAll('-', '+').replaceAll('_', '/')}=`,
        auth: `${sub.keys.auth}==`,
      },
    };
    expect(
      (await request(api.app).post('/api/me/push').set('Cookie', cookie).send(standard)).status,
    ).toBe(201);
    const [row] = await api.handle.db.select().from(pushSubscriptions);
    expect(row).toMatchObject(sub.keys);

    const short = { ...sub, keys: { ...sub.keys, auth: 'abc' } };
    expect(
      (await request(api.app).post('/api/me/push').set('Cookie', cookie).send(short)).status,
    ).toBe(400);
  });

  it('rejects non-https endpoints and missing keys', async () => {
    expect(
      (
        await request(api.app)
          .post('/api/me/push')
          .set('Cookie', cookie)
          .send({ ...sub, endpoint: 'http://x.test/1' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(api.app)
          .post('/api/me/push')
          .set('Cookie', cookie)
          .send({ endpoint: sub.endpoint })
      ).status,
    ).toBe(400);
  });

  it('requires sign-in', async () => {
    expect((await request(api.app).post('/api/me/push').send(sub)).status).toBe(401);
  });

  it('serves the VAPID public key publicly', async () => {
    const res = await request(api.app).get('/api/push/public-key');
    expect(res.body).toEqual({ publicKey: 'BTestPublicKey' });
  });
});
