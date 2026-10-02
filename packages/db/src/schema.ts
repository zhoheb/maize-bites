import type { DietaryTag, MealType } from '@maize-bites/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// drizzle-kit loads this file directly and cannot resolve workspace packages at runtime, so
// only `import type` from @maize-bites/shared here. Enum values are duplicated from
// shared/src/enums.ts; schema.test.ts asserts they match.

export const eventSource = pgEnum('event_source', ['happening', 'submission']);
export const eventStatus = pgEnum('event_status', ['active', 'cancelled', 'removed']);
export const classificationMethod = pgEnum('classification_method', ['rules', 'llm', 'manual']);
export const audience = pgEnum('audience', ['open', 'members', 'rsvp']);
export const campus = pgEnum('campus', ['central', 'north', 'medical', 'athletic']);
export const channel = pgEnum('channel', ['email', 'push']);
export const reportKind = pgEnum('report_kind', [
  'food_gone',
  'still_food',
  'not_free',
  'wrong_info',
]);
export const submissionStatus = pgEnum('submission_status', ['pending', 'approved', 'rejected']);
export const subscriptionMode = pgEnum('subscription_mode', ['instant', 'digest']);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();
const emptyTextArray = sql`'{}'::text[]`;

export const buildings = pgTable(
  'buildings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    aliases: text('aliases').array().notNull().default(emptyTextArray),
    campus: campus('campus').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
  },
  (t) => [index('buildings_aliases_idx').using('gin', t.aliases)],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: eventSource('source').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    /** Distinguishes occurrences of a recurring event. Sources without occurrences use '0'. */
    occurrenceId: text('occurrence_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: timestamptz('starts_at').notNull(),
    endsAt: timestamptz('ends_at'),
    locationName: text('location_name'),
    buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'set null' }),
    room: text('room'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    url: text('url'),
    sponsor: text('sponsor'),
    tags: text('tags').array().notNull().default(emptyTextArray),
    raw: jsonb('raw'),
    contentHash: text('content_hash').notNull(),
    firstSeenAt: timestamptz('first_seen_at').notNull().defaultNow(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    status: eventStatus('status').notNull().default('active'),
  },
  (t) => [
    uniqueIndex('events_source_key').on(t.source, t.sourceEventId, t.occurrenceId),
    index('events_starts_at_idx').on(t.startsAt),
    index('events_building_id_idx').on(t.buildingId),
    check('events_ends_after_starts', sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
  ],
);

export const classifications = pgTable(
  'classifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** The events.content_hash this verdict was made against. */
    contentHash: text('content_hash').notNull(),
    method: classificationMethod('method').notNull(),
    /** Model id for llm rows, e.g. claude-haiku-4-5. Null for rules/manual. */
    model: text('model'),
    hasFreeFood: boolean('has_free_food').notNull(),
    confidence: real('confidence').notNull(),
    foodItems: text('food_items').array().notNull().default(emptyTextArray),
    mealType: text('meal_type').$type<MealType>(),
    dietary: text('dietary').array().$type<DietaryTag[]>().notNull().default(emptyTextArray),
    audience: audience('audience'),
    evidence: text('evidence'),
    createdAt: createdAt(),
  },
  (t) => [
    index('classifications_event_id_idx').on(t.eventId, t.createdAt),
    check('classifications_confidence_range', sql`${t.confidence} between 0 and 1`),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    isAdmin: boolean('is_admin').notNull().default(false),
    /** Incremented per approved submission; tips auto-publish at 3. */
    trustLevel: integer('trust_level').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check('users_umich_email', sql`${t.email} ~ '^[a-z0-9._%+-]+@umich\\.edu$'`)],
);

/** Single-use sign-in links. Only the SHA-256 of the token is stored. */
export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: createdAt(),
    expiresAt: timestamptz('expires_at').notNull(),
    usedAt: timestamptz('used_at'),
  },
  (t) => [index('magic_link_tokens_email_idx').on(t.email, t.createdAt)],
);

/** Browser sessions. The cookie holds a random token; only its SHA-256 is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: createdAt(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    /** Empty means all campuses. */
    campuses: campus('campuses')
      .array()
      .notNull()
      .default(sql`'{}'::campus[]`),
    dietary: text('dietary').array().$type<DietaryTag[]>().notNull().default(emptyTextArray),
    openOnly: boolean('open_only').notNull().default(false),
    mode: subscriptionMode('mode').notNull().default('instant'),
    /** Local (America/Detroit) wall-clock times. */
    quietStart: time('quiet_start'),
    quietEnd: time('quiet_end'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('subscriptions_user_channel_key').on(t.userId, t.channel)],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_user_id_idx').on(t.userId)],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    locationName: text('location_name').notNull(),
    /** Picked from the buildings autocomplete. */
    buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'set null' }),
    room: text('room'),
    startsAt: timestamptz('starts_at').notNull(),
    endsAt: timestamptz('ends_at'),
    status: submissionStatus('status').notNull().default('pending'),
    /** Null for auto-published tips from trusted users. */
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamptz('reviewed_at'),
    /** Set when approved and published as an event. */
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('submissions_status_idx').on(t.status),
    index('submissions_user_id_idx').on(t.userId),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reportKind('kind').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // One vote per user per kind, so "3 food_gone reports" means 3 different people.
    uniqueIndex('reports_event_user_kind_key').on(t.eventId, t.userId, t.kind),
    index('reports_event_id_kind_idx').on(t.eventId, t.kind),
  ],
);

export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    sentAt: timestamptz('sent_at').notNull().defaultNow(),
    /** 'instant' or 'digest'. */
    kind: text('kind').$type<'instant' | 'digest'>().notNull().default('instant'),
    /** Set when delivery failed. The row still blocks a resend (at-most-once). */
    error: text('error'),
  },
  (t) => [
    uniqueIndex('notification_log_user_event_channel_key').on(t.userId, t.eventId, t.channel),
  ],
);

export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startedAt: timestamptz('started_at').notNull().defaultNow(),
    /** Null while running or if the run crashed. */
    finishedAt: timestamptz('finished_at'),
    fetched: integer('fetched').notNull().default(0),
    created: integer('created').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    classified: integer('classified').notNull().default(0),
    /** Events marked removed because the feed stopped listing them. */
    removed: integer('removed').notNull().default(0),
    /** Every feed page was fetched. Removal only runs on complete fetches. */
    complete: boolean('complete').notNull().default(false),
    errors: integer('errors').notNull().default(0),
    errorMessages: text('error_messages').array().notNull().default(emptyTextArray),
  },
  (t) => [index('ingestion_runs_started_at_idx').on(t.startedAt)],
);

/**
 * Events that need a human: the classifier couldn't produce a valid verdict for this content.
 * Keyed by content hash so a flagged version isn't re-sent to the LLM every run.
 */
export const reviewFlags = pgTable(
  'review_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    contentHash: text('content_hash').notNull(),
    /** Machine-readable cause, e.g. 'llm_invalid_output'. */
    reason: text('reason').notNull(),
    detail: text('detail'),
    createdAt: createdAt(),
    resolvedAt: timestamptz('resolved_at'),
  },
  (t) => [uniqueIndex('review_flags_event_hash_key').on(t.eventId, t.contentHash)],
);

/** Who did what, for every admin action. Append-only. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** e.g. 'submission.approve', 'event.override', 'building.add_alias'. */
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_at_idx').on(t.createdAt)],
);

/** Feed location names that matched no building. Review these to add aliases. */
export const locationMisses = pgTable('location_misses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Output of the worker's location normalizer; the dedupe key. */
  normalizedName: text('normalized_name').notNull().unique(),
  /** Most recent raw spelling seen. */
  locationName: text('location_name').notNull(),
  /** Total event sightings across runs. */
  seenCount: integer('seen_count').notNull().default(0),
  firstSeenAt: timestamptz('first_seen_at').notNull().defaultNow(),
  lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
});

export type BuildingRow = typeof buildings.$inferSelect;
export type NewBuildingRow = typeof buildings.$inferInsert;
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type ClassificationRow = typeof classifications.$inferSelect;
export type NewClassificationRow = typeof classifications.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type NotificationLogRow = typeof notificationLog.$inferSelect;
export type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type IngestionRunRow = typeof ingestionRuns.$inferSelect;
export type LocationMissRow = typeof locationMisses.$inferSelect;
export type ReviewFlagRow = typeof reviewFlags.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
