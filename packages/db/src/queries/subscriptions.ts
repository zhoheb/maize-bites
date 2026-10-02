import type { Campus, Channel, DietaryTag, SubscriptionMode } from '@maize-bites/shared';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  pushSubscriptions,
  subscriptions,
  users,
  type PushSubscriptionRow,
  type SubscriptionRow,
} from '../schema.js';

/** One preference set, stored as one subscriptions row per enabled channel. */
export interface AlertPreferences {
  channels: Channel[];
  campuses: Campus[];
  dietary: DietaryTag[];
  openOnly: boolean;
  mode: SubscriptionMode;
  /** "HH:MM" wall-clock times in America/Detroit, or null for no quiet hours. */
  quietHours: { start: string; end: string } | null;
}

export function listSubscriptions(db: Database, userId: string): Promise<SubscriptionRow[]> {
  return db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
}

/** Makes the user's rows match `prefs`: upserts enabled channels, deletes the rest. */
export async function replaceSubscriptions(
  db: Database,
  userId: string,
  prefs: AlertPreferences,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(subscriptions)
      .where(
        prefs.channels.length === 0
          ? eq(subscriptions.userId, userId)
          : and(
              eq(subscriptions.userId, userId),
              notInArray(subscriptions.channel, prefs.channels),
            ),
      );
    for (const channel of prefs.channels) {
      const values = {
        campuses: prefs.campuses,
        dietary: prefs.dietary,
        openOnly: prefs.openOnly,
        mode: prefs.mode,
        quietStart: prefs.quietHours?.start ?? null,
        quietEnd: prefs.quietHours?.end ?? null,
      };
      await tx
        .insert(subscriptions)
        .values({ userId, channel, ...values })
        .onConflictDoUpdate({ target: [subscriptions.userId, subscriptions.channel], set: values });
    }
  });
}

export interface Subscriber {
  subscription: SubscriptionRow;
  email: string;
}

export function listSubscribers(db: Database, mode: SubscriptionMode): Promise<Subscriber[]> {
  return db
    .select({ subscription: subscriptions, email: users.email })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(eq(subscriptions.mode, mode));
}

/** Registers (or re-assigns) a browser push endpoint. */
export async function savePushSubscription(
  db: Database,
  sub: { userId: string; endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values(sub)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: sub.userId, p256dh: sql`excluded.p256dh`, auth: sql`excluded.auth` },
    });
}

/** Removes the user's endpoint. Returns whether a row was deleted. */
export async function deletePushSubscription(
  db: Database,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export function listPushSubscriptions(
  db: Database,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

/** For endpoints the push service reports gone (404/410). */
export async function deletePushEndpoint(db: Database, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
