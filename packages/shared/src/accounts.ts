import { z } from 'zod';
import { campusSchema, channelSchema, dietaryTagSchema, subscriptionModeSchema } from './enums.js';

// Auth, alert preference, and push contracts shared by apps/api and apps/web.

/** Same rule as the users table check constraint. Normalizes case and whitespace first. */
export const UMICH_EMAIL = /^[a-z0-9._%+-]+@umich\.edu$/;
export const umichEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(UMICH_EMAIL, 'Use your @umich.edu email address');

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const magicLinkRequestSchema = z.object({ email: umichEmailSchema });

/** 32 random bytes, base64url: 43 characters. */
export const verifyQuerySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token'),
});

export const currentUserSchema = z.object({ email: z.string(), isAdmin: z.boolean() });
export const meResponseSchema = z.object({ user: currentUserSchema });
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** "HH:MM" in America/Detroit. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

const uniqueArray = <T extends z.ZodType>(item: T) =>
  z.array(item).refine((xs) => new Set(xs).size === xs.length, 'Duplicate values');

export const alertPreferencesSchema = z.object({
  /** Empty = alerts off. */
  channels: uniqueArray(channelSchema),
  /** Empty = every campus. */
  campuses: uniqueArray(campusSchema),
  /** Event must list every one of these. */
  dietary: uniqueArray(dietaryTagSchema),
  openOnly: z.boolean(),
  mode: subscriptionModeSchema,
  /** No instant alerts inside this window (may wrap midnight). Null = none. */
  quietHours: z
    .object({ start: timeOfDaySchema, end: timeOfDaySchema })
    .refine((q) => q.start !== q.end, 'Quiet hours need different start and end times')
    .nullable(),
});
export type AlertPreferencesInput = z.infer<typeof alertPreferencesSchema>;

export const DEFAULT_ALERT_PREFERENCES: AlertPreferencesInput = {
  channels: [],
  campuses: [],
  dietary: [],
  openOnly: false,
  mode: 'instant',
  quietHours: null,
};

/** Rewrites standard base64 (`+`, `/`, `=` padding) as the unpadded URL-safe form. */
export function toBase64Url(value: string): string {
  return value.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Unpadded URL-safe base64 of exactly `bytes` bytes, the form Web Push uses for keys. */
export const base64UrlKeySchema = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'must be URL-safe base64 (A-Z, a-z, 0-9, - and _, no padding)')
    .length(Math.ceil((bytes * 4) / 3), `must encode ${bytes} bytes`);

/** A subscription's keys, normalized to URL-safe base64: a P-256 point and a 16-byte secret. */
export const pushKeysSchema = z.object({
  p256dh: z.string().max(200).transform(toBase64Url).pipe(base64UrlKeySchema(65)),
  auth: z.string().max(100).transform(toBase64Url).pipe(base64UrlKeySchema(16)),
});

/** PushSubscription.toJSON() from the browser. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  expirationTime: z.number().nullable().optional(),
  keys: pushKeysSchema,
});
export const pushUnsubscribeSchema = z.object({ endpoint: z.url({ protocol: /^https$/ }) });
export const pushPublicKeySchema = z.object({ publicKey: z.string().nullable() });

/** Payload the worker sends and the service worker displays. */
export const pushPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  /** Path to open on click, e.g. /events/<id>. */
  url: z.string().startsWith('/'),
  /** Collapses repeat notifications for the same thing. */
  tag: z.string(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;
