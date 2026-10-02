import type { Channel } from '@maize-bites/shared';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { notificationLog } from '../schema.js';

export interface NotificationKey {
  userId: string;
  eventId: string;
  channel: Channel;
}

/**
 * Records the intent to notify before sending. Returns false if this (user, event, channel)
 * was already claimed, in which case the caller must not send. At-most-once by design.
 */
export async function claimNotification(
  db: Database,
  key: NotificationKey & { kind: 'instant' | 'digest'; sentAt: Date },
): Promise<boolean> {
  const rows = await db
    .insert(notificationLog)
    .values(key)
    .onConflictDoNothing({
      target: [notificationLog.userId, notificationLog.eventId, notificationLog.channel],
    })
    .returning({ id: notificationLog.id });
  return rows.length > 0;
}

export async function recordNotificationError(
  db: Database,
  key: NotificationKey,
  error: string,
): Promise<void> {
  await db
    .update(notificationLog)
    .set({ error: error.slice(0, 1000) })
    .where(
      and(
        eq(notificationLog.userId, key.userId),
        eq(notificationLog.eventId, key.eventId),
        eq(notificationLog.channel, key.channel),
      ),
    );
}
