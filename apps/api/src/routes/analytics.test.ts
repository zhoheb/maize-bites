import { analyticsSalts, auditLog, pageViews, sql, subscriptions, users } from '@maize-bites/db';
import { adminAnalyticsResponseSchema } from '@maize-bites/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOW, WEB_ORIGIN, createTestApi, signIn, signInAdmin, type TestApi } from '../test/seed.js';

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const IP = '203.0.113.7';

let api: TestApi;
let clock: Date;

beforeEach(async () => {
  clock = NOW;
  // Two proxy hops, as in production (Vercel's rewrite, then Render's load balancer).
  api = await createTestApi({ now: () => clock, trustProxy: 2 });
});
afterEach(async () => {
  await api.handle.close();
});

interface Visit {
  path?: string;
  referrer?: string | null;
  screen?: 'small' | 'medium' | 'large';
  ua?: string | null;
  ip?: string;
  headers?: Record<string, string>;
  cookie?: string;
}

/** Sends a beacon as the browser would, through both proxies. */
async function visit({
  path = '/',
  referrer = null,
  screen = 'large',
  ua = CHROME,
  ip = IP,
  headers = {},
  cookie,
}: Visit = {}) {
  let req = request(api.app)
    .post('/api/analytics/view')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', `${ip}, 76.76.21.21`)
    .set(headers);
  if (ua !== null) req = req.set('User-Agent', ua);
  if (cookie) req = req.set('Cookie', cookie);
  const res = await req.type('application/json').send(JSON.stringify({ path, referrer, screen }));
  expect(res.status).toBe(204);
  return res;
}

const rows = () => api.handle.db.select().from(pageViews);
const countViews = () => api.handle.db.$count(pageViews);

describe('POST /api/analytics/view', () => {
  it('counts the same visitor once a day and gives them a new id the next day', async () => {
    await visit();
    await visit({ path: '/about' });
    await visit({ ip: '198.51.100.2' }); // someone else
    let stored = await rows();
    expect(stored).toHaveLength(3);
    expect(new Set(stored.map((r) => r.visitorId)).size).toBe(2);

    clock = new Date(NOW.getTime() + 24 * 3_600_000);
    await visit();
    stored = await rows();
    const [first] = stored;
    const nextDay = stored.find((r) => r.day !== first?.day);
    expect(nextDay?.day).toBe('2026-10-02');
    expect(stored.filter((r) => r.visitorId === nextDay?.visitorId)).toHaveLength(1);
  });

  it('never stores the IP address or User-Agent', async () => {
    await visit({ referrer: 'www.reddit.com', screen: 'small', ua: SAFARI_IPHONE });
    const [row] = await rows();
    expect(row).toMatchObject({
      path: '/',
      referrerHost: 'reddit.com',
      device: 'mobile',
      isSignedIn: false,
    });
    expect(row?.visitorId).toMatch(/^[0-9a-f]{64}$/);
    const everything = JSON.stringify(await api.handle.db.execute(sql`select * from page_views`));
    for (const secret of [IP, '203.0.113', SAFARI_IPHONE, 'iPhone']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('reads the client IP behind the proxies, not the proxy address', async () => {
    await visit({ ip: '198.51.100.9' });
    await visit({ ip: '198.51.100.10' });
    expect(new Set((await rows()).map((r) => r.visitorId)).size).toBe(2);
  });

  it('stores routes without query strings or ids', async () => {
    await visit({ path: '/events/6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11?ref=share' });
    await visit({ path: '/?event=6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11&tab=today' });
    await visit({ path: '/auth/verify?token=abc' });
    await visit({ path: '/no/such/page' });
    expect((await rows()).map((r) => r.path).sort()).toEqual([
      '/404',
      '/auth/verify',
      '/events/:id',
      '/events/:id',
    ]);
  });

  it.each([
    ['no User-Agent', { ua: null }],
    [
      'a crawler',
      { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    ],
    ['a link preview', { ua: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' }],
    ['headless Chrome', { ua: CHROME.replace('Chrome/', 'HeadlessChrome/') }],
    ['curl', { ua: 'curl/8.7.1' }],
    ['a prefetch', { headers: { 'Sec-Purpose': 'prefetch' } }],
    ['Do Not Track', { headers: { DNT: '1' } }],
    ['Global Privacy Control', { headers: { 'Sec-GPC': '1' } }],
    ['an admin page', { path: '/admin' }],
  ] satisfies [string, Visit][])('skips %s', async (_name, v) => {
    await visit(v);
    expect(await countViews()).toBe(0);
  });

  it("skips an admin's own visits unless they turn that off", async () => {
    const admin = await signInAdmin(api);
    await visit({ cookie: admin });
    expect(await countViews()).toBe(0);

    const off = await request(api.app)
      .put('/api/admin/analytics/settings')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', admin)
      .send({ excludeSelf: false });
    expect(off.status).toBe(200);
    await visit({ cookie: admin });
    expect(await countViews()).toBe(1);
    expect(await api.handle.db.$count(auditLog, sql`action = 'analytics.exclude_self'`)).toBe(1);
  });

  it('counts signed-in visitors as signed in, without who they are', async () => {
    const cookie = await signIn(api, 'wolverine@umich.edu');
    await visit({ cookie });
    const [row] = await rows();
    expect(row?.isSignedIn).toBe(true);
    const [user] = await api.handle.db.select().from(users);
    expect(JSON.stringify(row)).not.toContain(user?.id ?? 'missing');
  });

  it('answers 204 to input it ignores', async () => {
    const res = await request(api.app)
      .post('/api/analytics/view')
      .set('User-Agent', CHROME)
      .send({ path: 'not-a-path', screen: 'huge' });
    expect(res.status).toBe(204);
    expect(await countViews()).toBe(0);
  });

  it('drops beacons over the rate limit, still with a 204', async () => {
    await api.handle.close();
    api = await createTestApi({
      now: () => clock,
      trustProxy: 2,
      rateLimits: {
        magicLinkPerIp: { windowMs: 60_000, limit: 100 },
        magicLinkPerEmail: { windowMs: 60_000, limit: 100 },
        submissionsPerUser: { windowMs: 60_000, limit: 100 },
        reportsPerUser: { windowMs: 60_000, limit: 100 },
        pageViewsPerIp: { windowMs: 60_000, limit: 2 },
      },
    });
    for (let i = 0; i < 4; i++) await visit();
    expect(await countViews()).toBe(2);
    await visit({ ip: '198.51.100.3' });
    expect(await countViews()).toBe(3);
  });

  it('deletes salts from before yesterday when a new day starts', async () => {
    await api.handle.db.insert(analyticsSalts).values({ day: '2026-09-28', salt: 'old' });
    await visit();
    expect((await api.handle.db.select().from(analyticsSalts)).map((r) => r.day)).toEqual([
      '2026-10-01',
    ]);
  });
});

describe('GET /api/admin/analytics', () => {
  it('reports tiles, a daily series, top pages and referrers, and the device split', async () => {
    const yesterday = new Date(NOW.getTime() - 24 * 3_600_000);
    clock = yesterday;
    await visit({ ip: '198.51.100.1', referrer: 'reddit.com' });
    await visit({ ip: '198.51.100.2', ua: SAFARI_IPHONE, screen: 'small' });
    clock = NOW;
    await visit({ ip: '198.51.100.1', referrer: 'instagram.com' });
    await visit({ ip: '198.51.100.1', path: '/events/abc' });
    const admin = await signInAdmin(api);
    const [user] = await api.handle.db.select().from(users);
    if (!user) throw new Error('admin missing');
    await api.handle.db.insert(subscriptions).values({ userId: user.id, channel: 'email' });

    const res = await request(api.app).get('/api/admin/analytics?range=30d').set('Cookie', admin);
    expect(res.status).toBe(200);
    const body = adminAnalyticsResponseSchema.parse(res.body);
    expect(body.today).toBe('2026-10-01');
    expect(body.tiles.today).toEqual({ value: 1, previous: 2 });
    expect(body.tiles.yesterday).toEqual({ value: 2, previous: 0 });
    expect(body.series).toHaveLength(30);
    expect(body.series.at(-1)).toMatchObject({
      day: '2026-10-01',
      uniqueVisitors: 1,
      pageViews: 2,
      eventVisitors: 1,
    });
    expect(body.series.at(-1)?.alertSignups).toBeGreaterThanOrEqual(0);
    expect(body.topPages[0]).toEqual({ name: '/', views: 3 });
    expect(body.topReferrers.map((r) => r.name).sort()).toEqual(['instagram.com', 'reddit.com']);
    expect(body.mobileShare).toBeCloseTo(1 / 3);
    expect(body.excludeSelf).toBe(true);
  });

  it('rejects an unknown range', async () => {
    const admin = await signInAdmin(api);
    const res = await request(api.app).get('/api/admin/analytics?range=7y').set('Cookie', admin);
    expect(res.status).toBe(400);
  });
});
