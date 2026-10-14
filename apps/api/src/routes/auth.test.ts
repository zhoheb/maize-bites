import { magicLinkTokens, sessions, sql, users } from '@maize-bites/db';

const eq = (column: typeof users.email, value: string) => sql`${column} = ${value}`;
import { apiErrorSchema, meResponseSchema } from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../auth/tokens.js';
import { DEFAULT_RATE_LIMITS } from '../rate-limit.js';
import { NOW, WEB_ORIGIN, createTestApi, type TestApi } from '../test/seed.js';

let api: TestApi;
let clock: Date;

beforeEach(async () => {
  clock = NOW;
  api = await createTestApi({ now: () => clock });
});
afterEach(async () => {
  await api.handle.close();
});

const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

async function requestLink(email = 'Wolverine@UMich.edu') {
  return request(api.app).post('/api/auth/magic-link').send({ email });
}

/** The token from the most recent sign-in email. */
function lastToken(): string {
  const text = api.outbox.at(-1)?.text ?? '';
  const match = /\/auth\/verify\?token=([A-Za-z0-9_-]{43})/.exec(text);
  if (!match?.[1]) throw new Error(`no token in email: ${text}`);
  return match[1];
}

function sessionCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('mb_session='));
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

async function signIn(email?: string) {
  await requestLink(email);
  const res = await request(api.app).get('/api/auth/verify').query({ token: lastToken() });
  return sessionCookie(res).split(';')[0] ?? '';
}

describe('POST /api/auth/magic-link', () => {
  it('emails a sign-in link to the web app and stores only a hash of the token', async () => {
    const res = await requestLink();

    expect(res.status).toBe(202);
    const email = api.outbox.at(-1);
    expect(email?.to).toBe('wolverine@umich.edu'); // normalized
    expect(email?.text).toContain(`${WEB_ORIGIN}/auth/verify?token=`);

    const token = lastToken();
    const rows = await api.handle.db.select().from(magicLinkTokens);
    expect(rows).toEqual([
      expect.objectContaining({
        email: 'wolverine@umich.edu',
        tokenHash: hashToken(token),
        expiresAt: minutes(15),
        usedAt: null,
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it.each(['someone@gmail.com', 'x@med.umich.edu', 'x@umich.edu.evil.com', 'not an email', ''])(
    'rejects %j with 400 and sends nothing',
    async (email) => {
      const res = await requestLink(email);
      expect(res.status).toBe(400);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('invalid_request');
      expect(api.outbox).toHaveLength(0);
    },
  );
});

describe('token lifecycle (GET /api/auth/verify)', () => {
  it('exchanges a valid token for an httpOnly, Secure, SameSite=Lax session cookie', async () => {
    await requestLink();
    const res = await request(api.app).get('/api/auth/verify').query({ token: lastToken() });

    expect(res.status).toBe(200);
    expect(meResponseSchema.parse(res.body)).toEqual({
      user: { email: 'wolverine@umich.edu', isAdmin: false },
    });
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/); // 30 days
    expect(await api.handle.db.$count(users, eq(users.email, 'wolverine@umich.edu'))).toBe(1);
  });

  it('is single-use', async () => {
    await requestLink();
    const token = lastToken();
    expect((await request(api.app).get('/api/auth/verify').query({ token })).status).toBe(200);

    const again = await request(api.app).get('/api/auth/verify').query({ token });
    expect(again.status).toBe(400);
    expect(apiErrorSchema.parse(again.body).error.code).toBe('invalid_token');
  });

  it('expires after 15 minutes', async () => {
    await requestLink();
    const token = lastToken();
    clock = minutes(15);

    const res = await request(api.app).get('/api/auth/verify').query({ token });
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('invalid_token');
  });

  it('works just before expiry', async () => {
    await requestLink();
    const token = lastToken();
    clock = minutes(14.9);
    expect((await request(api.app).get('/api/auth/verify').query({ token })).status).toBe(200);
  });

  it('rejects unknown and malformed tokens', async () => {
    const unknown = await request(api.app)
      .get('/api/auth/verify')
      .query({ token: 'A'.repeat(43) });
    expect(apiErrorSchema.parse(unknown.body).error.code).toBe('invalid_token');

    const malformed = await request(api.app).get('/api/auth/verify').query({ token: 'short' });
    expect(malformed.status).toBe(400);
    expect(apiErrorSchema.parse(malformed.body).error.code).toBe('invalid_request');
  });

  it('keeps earlier unused links valid when a new one is requested', async () => {
    await requestLink();
    const first = lastToken();
    await requestLink();
    expect((await request(api.app).get('/api/auth/verify').query({ token: first })).status).toBe(
      200,
    );
  });

  it('reuses the existing account on later sign-ins', async () => {
    await signIn();
    await signIn('WOLVERINE@umich.edu');
    expect(await api.handle.db.$count(users, eq(users.email, 'wolverine@umich.edu'))).toBe(1);
    expect(await api.handle.db.$count(sessions)).toBe(2);
  });
});

describe('sessions', () => {
  it('GET /api/me returns the signed-in user, and 401 without a session', async () => {
    const cookie = await signIn();

    const me = await request(api.app).get('/api/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(meResponseSchema.parse(me.body).user.email).toBe('wolverine@umich.edu');

    const anon = await request(api.app).get('/api/me');
    expect(anon.status).toBe(401);
    expect(apiErrorSchema.parse(anon.body).error.code).toBe('unauthorized');
  });

  it('ignores forged and expired session cookies', async () => {
    expect(
      (
        await request(api.app)
          .get('/api/me')
          .set('Cookie', `mb_session=${'x'.repeat(43)}`)
      ).status,
    ).toBe(401);
    expect((await request(api.app).get('/api/me').set('Cookie', 'mb_session=garbage')).status).toBe(
      401,
    );

    const cookie = await signIn();
    clock = new Date(NOW.getTime() + 31 * 24 * 3_600_000);
    expect((await request(api.app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('logout revokes the session server-side and clears the cookie', async () => {
    const cookie = await signIn();

    const res = await request(api.app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/mb_session=;.*Expires=Thu, 01 Jan 1970/);
    // Replaying the old cookie no longer works.
    expect((await request(api.app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
    expect(await api.handle.db.$count(sessions)).toBe(0);
  });

  it('logout requires a session', async () => {
    expect((await request(api.app).post('/api/auth/logout')).status).toBe(401);
  });
});

describe('rate limits', () => {
  it('limits sign-in emails per address', async () => {
    const limited = await createTestApi({
      rateLimits: {
        ...DEFAULT_RATE_LIMITS,
        magicLinkPerIp: { windowMs: 60_000, limit: 100 },
        magicLinkPerEmail: { windowMs: 60_000, limit: 2 },
      },
    });
    try {
      const send = (email: string) =>
        request(limited.app).post('/api/auth/magic-link').send({ email });
      expect((await send('a@umich.edu')).status).toBe(202);
      expect((await send('A@umich.edu')).status).toBe(202);
      const third = await send('a@umich.edu');
      expect(third.status).toBe(429);
      expect(apiErrorSchema.parse(third.body).error.code).toBe('rate_limited');
      expect((await send('b@umich.edu')).status).toBe(202); // other addresses unaffected
      expect(limited.outbox).toHaveLength(3);
    } finally {
      await limited.handle.close();
    }
  });

  it('limits sign-in requests per IP across addresses', async () => {
    const limited = await createTestApi({
      rateLimits: {
        ...DEFAULT_RATE_LIMITS,
        magicLinkPerIp: { windowMs: 60_000, limit: 2 },
        magicLinkPerEmail: { windowMs: 60_000, limit: 100 },
      },
    });
    try {
      const send = (email: string) =>
        request(limited.app).post('/api/auth/magic-link').send({ email });
      await send('a@umich.edu');
      await send('b@umich.edu');
      expect((await send('c@umich.edu')).status).toBe(429);
      expect(limited.outbox).toHaveLength(2);
    } finally {
      await limited.handle.close();
    }
  });
});

describe('write protection', () => {
  it('rejects writes from another origin', async () => {
    const res = await request(api.app)
      .post('/api/auth/magic-link')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@umich.edu' });
    expect(res.status).toBe(403);
    expect(api.outbox).toHaveLength(0);
  });

  it('allows writes from the web origin and from non-browser clients (no Origin)', async () => {
    const res = await request(api.app)
      .post('/api/auth/magic-link')
      .set('Origin', WEB_ORIGIN)
      .send({ email: 'a@umich.edu' });
    expect(res.status).toBe(202);
  });

  it('rejects non-JSON bodies (form posts)', async () => {
    const res = await request(api.app)
      .post('/api/auth/magic-link')
      .type('form')
      .send('email=a%40umich.edu');
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.message).toMatch(/JSON/);
  });
});

describe('ADMIN_EMAILS', () => {
  const isAdmin = async (email: string) => {
    const [row] = await api.handle.db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(sql`email = ${email}`);
    return row?.isAdmin;
  };
  const signInAs = async (app: TestApi, email: string) => {
    await request(app.app).post('/api/auth/magic-link').send({ email });
    const token = /token=([A-Za-z0-9_-]{43})/.exec(app.outbox.at(-1)?.text ?? '')?.[1] ?? '';
    return request(app.app).get('/api/auth/verify').query({ token });
  };

  beforeEach(async () => {
    await api.handle.close();
    api = await createTestApi({ adminEmails: ['zhoheb@umich.edu'] });
  });

  it('makes a listed address an admin on its first sign-in', async () => {
    const res = await signInAs(api, 'Zhoheb@umich.edu');
    expect(meResponseSchema.parse(res.body).user).toEqual({
      email: 'zhoheb@umich.edu',
      isAdmin: true,
    });
    expect(await isAdmin('zhoheb@umich.edu')).toBe(true);
  });

  it('promotes an existing account on its next sign-in', async () => {
    await api.handle.db.insert(users).values({ email: 'zhoheb@umich.edu' });
    expect(await isAdmin('zhoheb@umich.edu')).toBe(false);
    await signInAs(api, 'zhoheb@umich.edu');
    expect(await isAdmin('zhoheb@umich.edu')).toBe(true);
  });

  it('leaves unlisted accounts as they are, without demoting anyone', async () => {
    await api.handle.db.insert(users).values({ email: 'boss@umich.edu', isAdmin: true });
    await signInAs(api, 'wolverine@umich.edu');
    await signInAs(api, 'boss@umich.edu');
    expect(await isAdmin('wolverine@umich.edu')).toBe(false);
    expect(await isAdmin('boss@umich.edu')).toBe(true);
  });
});
