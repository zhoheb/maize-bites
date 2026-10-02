import {
  buildings,
  notificationLog,
  pushSubscriptions,
  replaceSubscriptions,
  savePushSubscription,
  seedBuildings,
  sql,
  subscriptions,
  upsertEvent,
  upsertUserByEmail,
  type AlertPreferences,
  type Database,
  type DbHandle,
} from '@maize-bites/db';
import type { EmailMessage } from '@maize-bites/email';
import type { PushPayload } from '@maize-bites/shared';
import { createTestDb, eventInput, insertClassification } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDelivery, type Delivery } from './delivery.js';
import { runDigest, runInstantAlerts } from './notifier.js';

const NOW = new Date('2026-10-01T16:00:00Z'); // noon in Ann Arbor
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
const WEB = 'https://maizebites.test';
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let handle: DbHandle;
let db: Database;
let emails: EmailMessage[];
let pushes: { userId: string; payload: PushPayload }[];
let delivery: Delivery;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  await seedBuildings(db);
  emails = [];
  pushes = [];
  delivery = {
    email: (m) => {
      emails.push(m);
      return Promise.resolve();
    },
    push: (userId, payload) => {
      pushes.push({ userId, payload });
      return Promise.resolve(1);
    },
  };
});
afterEach(async () => {
  await handle.close();
});

const PREFS: AlertPreferences = {
  channels: ['email'],
  campuses: [],
  dietary: [],
  openOnly: false,
  mode: 'instant',
  quietHours: null,
};

/** A user subscribed at `subscribedAt` (default: an hour before NOW). */
async function subscriber(
  email: string,
  prefs: Partial<AlertPreferences> = {},
  subscribedAt = at(-1),
) {
  const user = await upsertUserByEmail(db, email);
  await replaceSubscriptions(db, user.id, { ...PREFS, ...prefs });
  await db
    .update(subscriptions)
    .set({ createdAt: subscribedAt })
    .where(sql`${subscriptions.userId} = ${user.id}`);
  return user;
}

async function buildingId(name: string) {
  const [row] = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(sql`${buildings.name} = ${name}`);
  if (!row) throw new Error(`no building ${name}`);
  return row.id;
}

/** A published event (classified `publishedAt`, default 30 min before NOW). */
async function published(
  title: string,
  opts: {
    startsIn?: number;
    building?: string;
    dietary?: string[];
    audience?: 'open' | 'members' | 'rsvp';
    publishedAt?: Date;
  } = {},
) {
  const { event } = await upsertEvent(
    db,
    eventInput({
      title,
      startsAt: at(opts.startsIn ?? 2),
      buildingId: opts.building ? await buildingId(opts.building) : null,
    }),
    NOW,
  );
  await insertClassification(db, event, {
    foodItems: ['pizza'],
    dietary: (opts.dietary ?? []) as never,
    audience: opts.audience ?? 'open',
    createdAt: opts.publishedAt ?? at(-0.5),
  });
  return event;
}

const deps = (now = NOW) => ({ db, delivery, logger, webOrigin: WEB, now });

describe('runInstantAlerts', () => {
  it('emails matching subscribers about newly published events, with a link to the event', async () => {
    await subscriber('a@umich.edu');
    const e = await published('Pizza social', { building: 'Michigan Union' });

    const stats = await runInstantAlerts(deps());

    expect(stats).toEqual({ sent: 1, failed: 0, deferredQuiet: 0 });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: 'a@umich.edu',
      subject: 'Free food: Pizza social (pizza)',
    });
    expect(emails[0]?.text).toContain(`${WEB}/events/${e.id}`);
    expect(emails[0]?.text).toContain(`${WEB}/alerts`);
  });

  it('never alerts twice: a second run sends nothing (notification_log dedupe)', async () => {
    await subscriber('a@umich.edu');
    await published('Pizza social');

    await runInstantAlerts(deps());
    const second = await runInstantAlerts(deps(at(1)));

    expect(second.sent).toBe(0);
    expect(emails).toHaveLength(1);
    expect(await db.$count(notificationLog)).toBe(1);
  });

  it('skips when the log already has the (user, event, channel), e.g. from a crashed run', async () => {
    const user = await subscriber('a@umich.edu');
    const e = await published('Pizza social');
    await db
      .insert(notificationLog)
      .values({ userId: user.id, eventId: e.id, channel: 'email', sentAt: at(-0.2) });

    expect((await runInstantAlerts(deps())).sent).toBe(0);
    expect(emails).toHaveLength(0);
  });

  it('dedupes per channel: email and push each get one alert', async () => {
    const user = await subscriber('a@umich.edu', { channels: ['email', 'push'] });
    await published('Pizza social');

    await runInstantAlerts(deps());
    await runInstantAlerts(deps());

    expect(emails).toHaveLength(1);
    expect(pushes).toEqual([
      {
        userId: user.id,
        payload: expect.objectContaining({
          url: expect.stringMatching(/^\/events\//) as unknown,
          title: 'Free pizza',
        }) as unknown,
      },
    ]);
  });

  it('respects campus, dietary, and open-only filters', async () => {
    await subscriber('north@umich.edu', { campuses: ['north'] });
    await subscriber('vegan@umich.edu', { dietary: ['vegan'] });
    await subscriber('open@umich.edu', { openOnly: true });
    await published('Union pizza', { building: 'Michigan Union', audience: 'members' });
    await published('BBB vegan tacos', {
      building: 'Bob and Betty Beyster Building',
      dietary: ['vegan', 'vegetarian'],
    });

    await runInstantAlerts(deps());

    const got = (to: string) => emails.filter((m) => m.to === to).map((m) => m.subject);
    expect(got('north@umich.edu')).toEqual(['Free food: BBB vegan tacos (pizza)']);
    expect(got('vegan@umich.edu')).toEqual(['Free food: BBB vegan tacos (pizza)']);
    expect(got('open@umich.edu')).toEqual(['Free food: BBB vegan tacos (pizza)']);
  });

  it('does not blast new subscribers with events published before they signed up', async () => {
    await published('Old news', { publishedAt: at(-3) });
    await subscriber('a@umich.edu', {}, at(-1));
    await published('Fresh', { publishedAt: at(-0.5) });

    await runInstantAlerts(deps());
    expect(emails.map((m) => m.subject)).toEqual(['Free food: Fresh (pizza)']);
  });

  it('skips events that already ended and unpublished events', async () => {
    await subscriber('a@umich.edu');
    await published('Ended', { startsIn: -3 });
    const { event } = await upsertEvent(
      db,
      eventInput({ title: 'Unverified', startsAt: at(2) }),
      NOW,
    );
    await insertClassification(db, event, {
      method: 'rules',
      confidence: 0.3,
      createdAt: at(-0.5),
    });

    expect((await runInstantAlerts(deps())).sent).toBe(0);
  });

  describe('quiet hours', () => {
    it('defers during quiet hours without claiming, then sends once they end', async () => {
      // Quiet 10:00–13:00 local; NOW is noon.
      await subscriber('a@umich.edu', { quietHours: { start: '10:00', end: '13:00' } });
      await published('Pizza social', { startsIn: 3 });

      const during = await runInstantAlerts(deps());
      expect(during).toEqual({ sent: 0, failed: 0, deferredQuiet: 1 });
      expect(await db.$count(notificationLog)).toBe(0);

      const after = await runInstantAlerts(deps(at(1.1))); // 1:06 PM
      expect(after.sent).toBe(1);
      expect(emails).toHaveLength(1);
    });

    it('handles windows that wrap midnight', async () => {
      await subscriber('a@umich.edu', { quietHours: { start: '22:00', end: '07:00' } });
      await published('Morning bagels', { startsIn: 21 }); // 9 AM tomorrow

      expect((await runInstantAlerts(deps(at(11)))).deferredQuiet).toBe(1); // 11 PM
      expect((await runInstantAlerts(deps(at(19.5)))).sent).toBe(1); // 7:30 AM
    });
  });

  it('records delivery failures and does not retry them (at-most-once)', async () => {
    await subscriber('a@umich.edu');
    await published('Pizza social');
    const failing: Delivery = {
      ...delivery,
      email: () => Promise.reject(new Error('Resend: 500')),
    };

    const stats = await runInstantAlerts({ ...deps(), delivery: failing });
    expect(stats).toMatchObject({ sent: 0, failed: 1 });
    const [row] = await db.select().from(notificationLog);
    expect(row?.error).toBe('Resend: 500');

    expect((await runInstantAlerts(deps())).sent).toBe(0);
  });
});

describe('runDigest', () => {
  it("sends one email with today's matching events to digest subscribers only", async () => {
    await subscriber('digest@umich.edu', { mode: 'digest', campuses: ['central'] });
    await subscriber('instant@umich.edu', { mode: 'instant' });
    await published('Union lunch', { building: 'Michigan Union', startsIn: 1 });
    await published('Union dinner', { building: 'Michigan Union', startsIn: 6 });
    await published('North snack', { building: 'Bob and Betty Beyster Building', startsIn: 2 });
    await published('Tomorrow breakfast', { building: 'Michigan Union', startsIn: 20 });

    const stats = await runDigest(deps(at(-4.5))); // 7:30 AM

    expect(stats.sent).toBe(1);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.to).toBe('digest@umich.edu');
    expect(emails[0]?.subject).toBe('Today on campus: 2 free food events');
    expect(emails[0]?.text).toContain('Union lunch');
    expect(emails[0]?.text).toContain('Union dinner');
    expect(emails[0]?.text).not.toContain('Tomorrow breakfast');
  });

  it('re-running the same morning sends nothing', async () => {
    await subscriber('digest@umich.edu', { mode: 'digest' });
    await published('Union lunch', { startsIn: 1 });

    await runDigest(deps(at(-4.5)));
    const again = await runDigest(deps(at(-4.4)));

    expect(again.sent).toBe(0);
    expect(emails).toHaveLength(1);
  });

  it('sends nothing when no events match', async () => {
    await subscriber('digest@umich.edu', { mode: 'digest', dietary: ['kosher'] });
    await published('Union lunch', { startsIn: 1 });
    expect((await runDigest(deps(at(-4.5)))).sent).toBe(0);
  });
});

describe('createDelivery push', () => {
  const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:x@umich.edu' };
  const payload = { title: 't', body: 'b', url: '/events/1', tag: '1' };

  it('sends to every device and deletes endpoints the push service reports gone', async () => {
    const user = await upsertUserByEmail(db, 'a@umich.edu');
    for (const endpoint of ['https://push.test/live', 'https://push.test/gone']) {
      await savePushSubscription(db, { userId: user.id, endpoint, p256dh: 'k', auth: 'a' });
    }
    const sendPush = vi.fn((sub: { endpoint: string }) =>
      sub.endpoint.endsWith('gone')
        ? Promise.reject(Object.assign(new Error('Gone'), { statusCode: 410 }))
        : Promise.resolve({}),
    );
    const d = createDelivery({
      db,
      mailer: { send: vi.fn() },
      vapid,
      logger,
      sendPush: sendPush as never,
    });

    expect(await d.push(user.id, payload)).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect((await db.select().from(pushSubscriptions)).map((r) => r.endpoint)).toEqual([
      'https://push.test/live',
    ]);
  });

  it('fails when the user has no devices or push is not configured', async () => {
    const user = await upsertUserByEmail(db, 'a@umich.edu');
    const d = createDelivery({
      db,
      mailer: { send: vi.fn() },
      vapid,
      logger,
      sendPush: vi.fn() as never,
    });
    await expect(d.push(user.id, payload)).rejects.toThrow(/No push devices/);

    const unconfigured = createDelivery({ db, mailer: { send: vi.fn() }, vapid: null, logger });
    await expect(unconfigured.push(user.id, payload)).rejects.toThrow(/not configured/);
  });
});
