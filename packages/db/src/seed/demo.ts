import {
  CAMPUS_TIME_ZONE,
  wallTimeOf,
  wallTimeToUtc,
  type Audience,
  type DietaryTag,
  type MealType,
} from '@maize-bites/shared';
import { and, eq, inArray, like } from 'drizzle-orm';
import type { Database } from '../client.js';
import { upsertEvent } from '../queries/events.js';
import { buildings, classifications, events, reports, users } from '../schema.js';

// Demo data for looking at the site locally when there are no published events (for example
// with no ANTHROPIC_API_KEY, so nothing from a feed is ever confirmed). Every row is marked:
// source "submission", source_event_id "demo-<n>", and a title starting with "[demo]".

export const DEMO_TITLE_PREFIX = '[demo] ';
const DEMO_ID_PREFIX = 'demo-';
/** Stand-in accounts whose only purpose is to have reported a demo event's food gone. */
const DEMO_REPORTERS = [1, 2, 3].map((n) => `demo-reporter-${n}@umich.edu`);

/** Throws unless this is plainly a local development database. */
export function assertDemoSeedAllowed(env: {
  NODE_ENV?: string | undefined;
  DATABASE_URL: string;
}): void {
  if (env.NODE_ENV === 'production')
    throw new Error('Refusing to seed demo data: NODE_ENV is "production".');
  const host = new URL(env.DATABASE_URL).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host))
    throw new Error(
      `Refusing to seed demo data: DATABASE_URL points at ${host}, not this machine.`,
    );
}

interface DemoSpec {
  title: string;
  description: string;
  building: string;
  room: string;
  sponsor: string;
  foodItems: string[];
  mealType: MealType;
  dietary: DietaryTag[];
  audience: Audience;
  /** Minutes from now, for events that should be live or about to start. */
  startsInMinutes?: number;
  /** Otherwise a local day offset and hour, e.g. tomorrow at 12:30 is { day: 1, hour: 12.5 }. */
  day?: number;
  hour?: number;
  durationMinutes: number;
  /** Seed three "food's gone" reports, so the event shows as likely over. */
  likelyOver?: boolean;
}

const SPECS: DemoSpec[] = [
  // Live now or starting soon.
  {
    title: 'Leftover pizza from the CS town hall',
    description: 'Six boxes left over, cheese and veggie. Take a slice on your way through.',
    building: 'Bob and Betty Beyster Building',
    room: 'Tishman Hall',
    sponsor: 'Computer Science and Engineering',
    foodItems: ['pizza'],
    mealType: 'lunch',
    dietary: ['vegetarian'],
    audience: 'open',
    startsInMinutes: -20,
    durationMinutes: 60,
  },
  {
    title: 'Coffee and bagels study break',
    description: 'Bagels, cream cheese, fruit, and coffee while they last.',
    building: 'Shapiro Undergraduate Library',
    room: 'First floor lobby',
    sponsor: 'University Library',
    foodItems: ['bagels', 'coffee', 'fruit'],
    mealType: 'snacks',
    dietary: ['vegetarian'],
    audience: 'open',
    startsInMinutes: -10,
    durationMinutes: 90,
  },
  {
    title: 'Cookies after the career fair',
    description: 'A few trays of cookies and lemonade left in the ballroom lobby.',
    building: 'Michigan Union',
    room: 'Rogel Ballroom lobby',
    sponsor: 'University Career Center',
    foodItems: ['cookies', 'lemonade'],
    mealType: 'snacks',
    dietary: ['vegetarian'],
    audience: 'open',
    startsInMinutes: -45,
    durationMinutes: 75,
    likelyOver: true,
  },
  {
    title: 'Tacos before the watch party',
    description: 'Taco bar opens at the start. Corn tortillas, so gluten-free friendly.',
    building: 'Duderstadt Center',
    room: 'Connector',
    sponsor: 'North Campus Residence Hall Association',
    foodItems: ['tacos', 'chips and salsa'],
    mealType: 'dinner',
    dietary: ['gluten_free'],
    audience: 'open',
    startsInMinutes: 35,
    durationMinutes: 90,
  },
  // Later today.
  {
    title: 'Donuts with the Dean',
    description: 'Drop in for cider donuts and a chat.',
    building: 'Lurie Engineering Center',
    room: 'Lobby',
    sponsor: 'Michigan Engineering',
    foodItems: ['donuts', 'cider'],
    mealType: 'breakfast',
    dietary: ['vegetarian'],
    audience: 'open',
    day: 0,
    hour: 9,
    durationMinutes: 60,
  },
  {
    title: 'Lunch and learn: applying to grad school',
    description: 'Panel of current PhD students. Lunch provided: sandwiches and salad.',
    building: 'Rackham Graduate School',
    room: 'East Conference Room',
    sponsor: 'Rackham Graduate School',
    foodItems: ['sandwiches', 'salad'],
    mealType: 'lunch',
    dietary: ['vegetarian', 'vegan'],
    audience: 'rsvp',
    day: 0,
    hour: 12,
    durationMinutes: 60,
  },
  {
    title: 'Robotics lab open house',
    description: 'Tours every 20 minutes. Samosas and chai in the atrium.',
    building: 'Ford Motor Company Robotics Building',
    room: 'Atrium',
    sponsor: 'Michigan Robotics',
    foodItems: ['samosas', 'chai'],
    mealType: 'snacks',
    dietary: ['vegetarian', 'halal'],
    audience: 'open',
    day: 0,
    hour: 14,
    durationMinutes: 120,
  },
  {
    title: 'Global Cafe: dumpling night',
    description: 'Make and eat dumplings with international students. Vegan filling available.',
    building: 'Michigan League',
    room: 'Vandenberg Room',
    sponsor: 'International Center',
    foodItems: ['dumplings', 'tea'],
    mealType: 'dinner',
    dietary: ['vegan', 'vegetarian'],
    audience: 'open',
    day: 0,
    hour: 17.5,
    durationMinutes: 90,
  },
  {
    title: 'Design club general meeting',
    description: 'Members only this week. Boba for everyone who signed up.',
    building: 'Art & Architecture Building',
    room: 'Room 2104',
    sponsor: 'Stamps Design Club',
    foodItems: ['boba'],
    mealType: 'drinks',
    dietary: [],
    audience: 'members',
    day: 0,
    hour: 19,
    durationMinutes: 60,
  },
  {
    title: 'Late night breakfast',
    description: 'Pancakes, eggs, and hash browns before exams.',
    building: 'Pierpont Commons',
    room: 'East Room',
    sponsor: 'Center for Campus Involvement',
    foodItems: ['pancakes', 'eggs', 'hash browns'],
    mealType: 'dinner',
    dietary: ['vegetarian'],
    audience: 'open',
    day: 0,
    hour: 21.5,
    durationMinutes: 90,
  },
  // The rest of the week.
  {
    title: 'Farm stand tasting',
    description: 'Free samples from the campus farm: apples, cider, roasted squash.',
    building: 'The Diag',
    room: 'North side',
    sponsor: 'Sustainable Food Program',
    foodItems: ['apples', 'cider', 'squash'],
    mealType: 'snacks',
    dietary: ['vegan', 'gluten_free'],
    audience: 'open',
    day: 1,
    hour: 11,
    durationMinutes: 120,
  },
  {
    title: 'Hackathon kickoff dinner',
    description:
      'Dinner for registered hackers: burrito bowls, with gluten-free and vegan options.',
    building: 'Duderstadt Center',
    room: 'Connector',
    sponsor: 'MHacks',
    foodItems: ['burrito bowls'],
    mealType: 'dinner',
    dietary: ['vegan', 'gluten_free'],
    audience: 'rsvp',
    day: 1,
    hour: 18,
    durationMinutes: 90,
  },
  {
    title: 'Economics seminar with refreshments',
    description: 'Talk at 4, cookies and coffee from 3:45.',
    building: 'Weill Hall',
    room: 'Annenberg Auditorium',
    sponsor: 'Ford School of Public Policy',
    foodItems: ['cookies', 'coffee'],
    mealType: 'snacks',
    dietary: ['vegetarian'],
    audience: 'open',
    day: 2,
    hour: 15.75,
    durationMinutes: 90,
  },
  {
    title: 'Free ice cream social',
    description: 'Scoops from a local creamery, with dairy-free sorbet.',
    building: 'Michigan Union',
    room: 'Courtyard',
    sponsor: 'University Unions',
    foodItems: ['ice cream', 'sorbet'],
    mealType: 'snacks',
    dietary: ['vegetarian', 'dairy_free'],
    audience: 'open',
    day: 3,
    hour: 13,
    durationMinutes: 120,
  },
  {
    title: 'Women in EECS mixer',
    description: 'Mediterranean platters and mocktails. Open to all majors.',
    building: 'EECS Building',
    room: 'Atrium',
    sponsor: 'Women in Electrical and Computer Engineering',
    foodItems: ['hummus', 'falafel', 'pita'],
    mealType: 'dinner',
    dietary: ['vegetarian', 'vegan', 'halal'],
    audience: 'open',
    day: 4,
    hour: 17,
    durationMinutes: 120,
  },
  {
    title: 'Sunday bagel brunch',
    description: 'Kosher bagels, lox, and spreads. Everyone welcome.',
    building: 'Trotter Multicultural Center',
    room: 'Multipurpose Room',
    sponsor: 'Trotter Multicultural Center',
    foodItems: ['bagels', 'lox'],
    mealType: 'breakfast',
    dietary: ['kosher'],
    audience: 'open',
    day: 5,
    hour: 10.5,
    durationMinutes: 120,
  },
  {
    title: 'Thesis writing retreat',
    description: 'Quiet writing all afternoon. Lunch and snacks for registered grad students.',
    building: 'Hatcher Graduate Library',
    room: 'Gallery',
    sponsor: 'Sweetland Center for Writing',
    foodItems: ['wraps', 'chips', 'fruit'],
    mealType: 'lunch',
    dietary: ['vegetarian', 'nut_free'],
    audience: 'rsvp',
    day: 6,
    hour: 12,
    durationMinutes: 240,
  },
];

function startOf(spec: DemoSpec, now: Date): Date {
  if (spec.startsInMinutes !== undefined)
    return new Date(now.getTime() + spec.startsInMinutes * 60_000);
  const today = wallTimeOf(now, CAMPUS_TIME_ZONE);
  const hour = spec.hour ?? 12;
  return wallTimeToUtc(
    {
      year: today.year,
      month: today.month,
      day: today.day + (spec.day ?? 0),
      hour: Math.floor(hour),
      minute: Math.round((hour % 1) * 60),
    },
    CAMPUS_TIME_ZONE,
  );
}

export interface DemoEvent extends DemoSpec {
  startsAt: Date;
  endsAt: Date;
}

/**
 * The demo events with times placed relative to `now`: three live (one of them likely over),
 * one starting within the hour, the rest later today and through the week. A "today" slot that has already ended moves to the same time tomorrow, so
 * the list is the same size whatever time of day the seed runs.
 */
export function buildDemoEvents(now: Date): DemoEvent[] {
  return SPECS.map((spec) => {
    let startsAt = startOf(spec, now);
    let endsAt = new Date(startsAt.getTime() + spec.durationMinutes * 60_000);
    if (endsAt <= now) {
      startsAt = new Date(startsAt.getTime() + 24 * 3_600_000);
      endsAt = new Date(endsAt.getTime() + 24 * 3_600_000);
    }
    return { ...spec, startsAt, endsAt };
  });
}

const isDemoEvent = and(
  eq(events.source, 'submission'),
  like(events.sourceEventId, `${DEMO_ID_PREFIX}%`),
);

/**
 * Removes every demo event (and, by cascade, its classifications and reports) and the demo
 * reporter accounts.
 */
export async function clearDemoEvents(db: Database): Promise<number> {
  const deleted = await db.delete(events).where(isDemoEvent).returning({ id: events.id });
  await db.delete(users).where(inArray(users.email, DEMO_REPORTERS));
  return deleted.length;
}

/**
 * Inserts or refreshes the demo events. Idempotent: rerunning moves them to fresh times.
 * Needs the campus buildings (`pnpm db:seed`). Returns how many events were written.
 */
export async function seedDemoEvents(db: Database, now: Date = new Date()): Promise<number> {
  const demo = buildDemoEvents(now);
  const rows = await db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(inArray(buildings.name, [...new Set(demo.map((d) => d.building))]));
  const buildingIds = new Map(rows.map((b) => [b.name, b.id]));
  const missing = demo.map((d) => d.building).filter((name) => !buildingIds.has(name));
  if (missing.length > 0)
    throw new Error(
      `Buildings missing (run pnpm db:seed first): ${[...new Set(missing)].join(', ')}`,
    );

  for (const [index, d] of demo.entries()) {
    const { event } = await upsertEvent(
      db,
      {
        source: 'submission',
        sourceEventId: `${DEMO_ID_PREFIX}${index + 1}`,
        occurrenceId: '0',
        title: `${DEMO_TITLE_PREFIX}${d.title}`,
        description: `${d.description}\n\nThis is demo data, not a real event.`,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        locationName: d.building,
        buildingId: buildingIds.get(d.building) ?? null,
        room: d.room,
        sponsor: d.sponsor,
        status: 'active',
      },
      now,
    );
    // One manual verdict per demo event, replaced on each run, carrying the food details. It
    // also keeps the classifier from spending LLM calls on demo rows.
    await db.delete(classifications).where(eq(classifications.eventId, event.id));
    await db.insert(classifications).values({
      eventId: event.id,
      contentHash: event.contentHash,
      method: 'manual',
      model: null,
      hasFreeFood: true,
      confidence: 1,
      foodItems: d.foodItems,
      mealType: d.mealType,
      dietary: d.dietary,
      audience: d.audience,
      evidence: 'Demo data',
      createdAt: now,
    });

    // Reports are replaced on each run too, so "likely over" (three in the last hour) holds.
    await db.delete(reports).where(eq(reports.eventId, event.id));
    if (d.likelyOver) {
      await db
        .insert(users)
        .values(DEMO_REPORTERS.map((email) => ({ email })))
        .onConflictDoNothing({ target: users.email });
      const reporters = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, DEMO_REPORTERS));
      await db.insert(reports).values(
        reporters.map((reporter) => ({
          eventId: event.id,
          userId: reporter.id,
          kind: 'food_gone' as const,
          createdAt: now,
        })),
      );
    }
  }
  return demo.length;
}
