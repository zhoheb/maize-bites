import {
  buildings,
  reports,
  seedBuildings,
  sql,
  upsertEvent,
  users,
  type Database,
  type DbHandle,
  type EventRow,
} from '@maize-bites/db';
import { createTestDb, eventInput, insertClassification } from '@maize-bites/db/testing';
import { pino } from 'pino';
import request from 'supertest';
import type { EmailMessage } from '@maize-bites/email';
import { createApp, type AppDeps } from '../app.js';
import type { RateLimits } from '../rate-limit.js';

/** Thu Oct 1 2026, noon in Ann Arbor. */
export const NOW = new Date('2026-10-01T16:00:00Z');
export const WEB_ORIGIN = 'http://localhost:5173';
export const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

/** Box around central campus (Union, Diag). */
export const CENTRAL_BBOX = '-83.745,42.270,-83.730,42.282';
/** Box around north campus (BBB, Dude). */
export const NORTH_BBOX = '-83.725,42.285,-83.705,42.300';

export interface Seeded {
  /** Published events, in the default (starts_at) order. */
  pizza: EventRow; // Union, live now (started 30m ago), lunch, vegetarian, open, 3 food_gone reports
  boba: EventRow; // BBB (north), +2h, snacks, vegan+vegetarian, members
  bagels: EventRow; // no building, own Diag coords, +4h, snacks, vegan+gluten_free, open
  breakfast: EventRow; // University Hospital (medical), +20h, breakfast, rsvp
  dinner: EventRow; // Union, +7d, dinner, open
  ended: EventRow; // Union, ended 2h ago, lunch, open
  /** Not published. */
  reviewBand: EventRow;
  manualHidden: EventRow;
  removed: EventRow;
  rulesOnly: EventRow;
}

async function buildingId(db: Database, name: string): Promise<string> {
  const [row] = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(sql`${buildings.name} = ${name}`);
  if (!row) throw new Error(`seed building missing: ${name}`);
  return row.id;
}

async function seedApiFixtures(db: Database): Promise<Seeded> {
  await seedBuildings(db);
  const union = await buildingId(db, 'Michigan Union');
  const bbb = await buildingId(db, 'Bob and Betty Beyster Building');
  const hospital = await buildingId(db, 'University Hospital');

  const create = async (input: Parameters<typeof eventInput>[0]) =>
    (await upsertEvent(db, eventInput(input), NOW)).event;
  const publish = async (
    input: Parameters<typeof eventInput>[0],
    classification: Parameters<typeof insertClassification>[2],
  ) => {
    const event = await create(input);
    await insertClassification(db, event, { confidence: 0.9, ...classification });
    return event;
  };

  const pizza = await publish(
    {
      title: 'Pizza at the Union',
      buildingId: union,
      room: 'Pendleton Room',
      startsAt: at(-0.5),
      endsAt: at(0.5),
      url: 'https://events.umich.edu/event/1',
    },
    {
      foodItems: ['pizza'],
      mealType: 'lunch',
      dietary: ['vegetarian'],
      audience: 'open',
      evidence: 'free pizza',
    },
  );
  const boba = await publish(
    { title: 'CSE boba social', buildingId: bbb, startsAt: at(2), endsAt: at(3) },
    {
      foodItems: ['boba'],
      mealType: 'snacks',
      dietary: ['vegan', 'vegetarian'],
      audience: 'members',
      audienceEvidence: 'members only',
    },
  );
  const bagels = await publish(
    { title: 'Bagels on the Diag', lat: 42.2771, lng: -83.738, startsAt: at(4) },
    {
      foodItems: ['bagels'],
      mealType: 'snacks',
      dietary: ['vegan', 'gluten_free'],
      audience: 'open',
    },
  );
  const breakfast = await publish(
    { title: 'Grand rounds breakfast', buildingId: hospital, startsAt: at(20), endsAt: at(21) },
    {
      foodItems: ['eggs', 'coffee'],
      mealType: 'breakfast',
      audience: 'rsvp',
      audienceEvidence: 'RSVP required',
    },
  );
  const dinner = await publish(
    { title: 'Next week dinner', buildingId: union, startsAt: at(24 * 7) },
    { foodItems: ['tacos'], mealType: 'dinner', audience: 'open' },
  );
  const ended = await publish(
    { title: 'Ended lunch', buildingId: union, startsAt: at(-3), endsAt: at(-2) },
    { foodItems: ['sandwiches'], mealType: 'lunch', audience: 'open' },
  );

  const reviewBand = await publish(
    { title: 'Maybe snacks', buildingId: union, startsAt: at(1) },
    { confidence: 0.55 },
  );
  const manualHidden = await publish(
    { title: 'Paid dinner', buildingId: union, startsAt: at(1) },
    { createdAt: at(-1) },
  );
  await insertClassification(db, manualHidden, {
    method: 'manual',
    model: null,
    hasFreeFood: false,
    createdAt: at(-2),
  });
  const removed = await publish(
    { title: 'Removed event', buildingId: union, startsAt: at(1), status: 'removed' },
    {},
  );
  const rulesOnly = await publish(
    { title: 'Unverified candidate', startsAt: at(1) },
    { method: 'rules', model: null, confidence: 0.3 },
  );

  const [a, b, c, d] = await db
    .insert(users)
    .values(['a', 'b', 'c', 'd'].map((n) => ({ email: `${n}@umich.edu` })))
    .returning({ id: users.id });
  if (!a || !b || !c || !d) throw new Error('seed users missing');
  await db
    .insert(reports)
    .values([
      ...[a, b, c].map((u) => ({ eventId: pizza.id, userId: u.id, kind: 'food_gone' as const })),
      { eventId: pizza.id, userId: d.id, kind: 'still_food' },
      { eventId: boba.id, userId: a.id, kind: 'food_gone' },
    ]);

  return {
    pizza,
    boba,
    bagels,
    breakfast,
    dinner,
    ended,
    reviewBand,
    manualHidden,
    removed,
    rulesOnly,
  };
}

export interface TestApi {
  handle: DbHandle;
  app: ReturnType<typeof createApp>;
  seeded: Seeded;
  /** Emails "sent" by the app, newest last. */
  outbox: EmailMessage[];
}

/** Rate limits high enough that only the rate-limit tests hit them. */
export const TEST_RATE_LIMITS: RateLimits = {
  magicLinkPerIp: { windowMs: 60_000, limit: 1000 },
  magicLinkPerEmail: { windowMs: 60_000, limit: 1000 },
  submissionsPerUser: { windowMs: 60_000, limit: 1000 },
  reportsPerUser: { windowMs: 60_000, limit: 1000 },
  pageViewsPerIp: { windowMs: 60_000, limit: 1000 },
};

export async function createTestApi(overrides: Partial<AppDeps> = {}): Promise<TestApi> {
  const handle = await createTestDb();
  const seeded = await seedApiFixtures(handle.db);
  const outbox: EmailMessage[] = [];
  const app = createApp({
    db: handle.db,
    logger: pino({ level: 'silent' }),
    webOrigin: WEB_ORIGIN,
    now: () => NOW,
    mailer: {
      send: (m) => {
        outbox.push(m);
        return Promise.resolve();
      },
    },
    cookieSecure: true,
    vapidPublicKey: 'BTestPublicKey',
    rateLimits: TEST_RATE_LIMITS,
    ...overrides,
  });
  return { handle, app, seeded, outbox };
}

/** Signs in through the real magic-link flow and returns the session cookie header value. */
export async function signIn(api: TestApi, email: string): Promise<string> {
  await request(api.app).post('/api/auth/magic-link').send({ email });
  const token = /token=([A-Za-z0-9_-]{43})/.exec(api.outbox.at(-1)?.text ?? '')?.[1] ?? '';
  const res = await request(api.app).get('/api/auth/verify').query({ token });
  return ((res.headers['set-cookie'] as unknown as string[])[0] ?? '').split(';')[0] ?? '';
}

/** Creates an admin account and signs it in. */
export async function signInAdmin(api: TestApi, email = 'admin@umich.edu'): Promise<string> {
  await api.handle.db.insert(users).values({ email, isAdmin: true });
  return signIn(api, email);
}
