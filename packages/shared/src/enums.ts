import { z } from 'zod';

// Source of truth for enumerated values. The Postgres enums in packages/db/src/schema.ts
// mirror these; packages/db/src/schema.test.ts fails if they drift.

export const EVENT_SOURCES = ['happening', 'maizepages', 'submission'] as const;
export const EVENT_STATUSES = ['active', 'cancelled', 'removed'] as const;
export const CLASSIFICATION_METHODS = ['rules', 'llm', 'manual'] as const;
export const AUDIENCES = ['open', 'members', 'rsvp'] as const;
export const CAMPUSES = ['central', 'north', 'medical', 'athletic'] as const;
export const CHANNELS = ['email', 'push'] as const;
export const REPORT_KINDS = ['food_gone', 'still_food', 'not_free', 'wrong_info'] as const;
export const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const SUBSCRIPTION_MODES = ['instant', 'digest'] as const;

// Stored as text / text[] (validated here) so the classifier's vocabulary can grow without a migration.
export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'halal',
  'kosher',
] as const;
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'other'] as const;

export const eventSourceSchema = z.enum(EVENT_SOURCES);
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export const classificationMethodSchema = z.enum(CLASSIFICATION_METHODS);
export const audienceSchema = z.enum(AUDIENCES);
export const campusSchema = z.enum(CAMPUSES);
export const channelSchema = z.enum(CHANNELS);
export const reportKindSchema = z.enum(REPORT_KINDS);
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export const subscriptionModeSchema = z.enum(SUBSCRIPTION_MODES);
export const dietaryTagSchema = z.enum(DIETARY_TAGS);
export const mealTypeSchema = z.enum(MEAL_TYPES);

export type EventSource = z.infer<typeof eventSourceSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type ClassificationMethod = z.infer<typeof classificationMethodSchema>;
export type Audience = z.infer<typeof audienceSchema>;
export type Campus = z.infer<typeof campusSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type ReportKind = z.infer<typeof reportKindSchema>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;
export type SubscriptionMode = z.infer<typeof subscriptionModeSchema>;
export type DietaryTag = z.infer<typeof dietaryTagSchema>;
export type MealType = z.infer<typeof mealTypeSchema>;

/** Publish rule: show at or above this confidence. Manual classifications ignore it. */
export const PUBLISH_CONFIDENCE = 0.7;
/** Between this and PUBLISH_CONFIDENCE, events go to the admin review queue. */
export const REVIEW_CONFIDENCE = 0.4;
