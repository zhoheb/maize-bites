import { deletePushEndpoint, listPushSubscriptions, type Database } from '@maize-bites/db';
import type { EmailMessage, Mailer } from '@maize-bites/email';
import { pushKeysSchema, type PushPayload } from '@maize-bites/shared';
import webpush from 'web-push';

/** How the notifier reaches people. Swapped for fakes in tests. */
export interface Delivery {
  email: (message: EmailMessage) => Promise<void>;
  /** Sends to every registered device. Returns how many accepted it. */
  push: (userId: string, payload: PushPayload) => Promise<number>;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** mailto: or https: contact for the push service. */
  subject: string;
}

type SendPush = typeof webpush.sendNotification;

/**
 * The Topic header for a tag. Push services accept only URL-safe base64 characters there, at
 * most 32, and web-push throws on anything else, so a tag like "digest-Wednesday, October 14"
 * has to be reduced first.
 */
export function pushTopic(tag: string): string | undefined {
  const topic = tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return topic === '' ? undefined : topic;
}

export function createDelivery(options: {
  db: Database;
  mailer: Mailer;
  vapid: VapidConfig | null;
  logger: Pick<Console, 'warn'>;
  sendPush?: SendPush;
}): Delivery {
  const { db, mailer, vapid, logger, sendPush = webpush.sendNotification.bind(webpush) } = options;
  return {
    email: (message) => mailer.send(message),
    push: async (userId, payload) => {
      if (!vapid) throw new Error('Web Push is not configured (VAPID keys missing)');
      const devices = await listPushSubscriptions(db, userId);
      if (devices.length === 0) throw new Error('No push devices registered');
      const topic = pushTopic(payload.tag);
      let delivered = 0;
      const failures: string[] = [];
      for (const device of devices) {
        const keys = pushKeysSchema.safeParse({ p256dh: device.p256dh, auth: device.auth });
        if (!keys.success) {
          // Keys no browser could have made; no send to this endpoint can ever succeed.
          await deletePushEndpoint(db, device.endpoint);
          logger.warn(
            `[notify] forgot push endpoint at ${new URL(device.endpoint).host}: malformed keys`,
          );
          continue;
        }
        try {
          await sendPush({ endpoint: device.endpoint, keys: keys.data }, JSON.stringify(payload), {
            vapidDetails: vapid,
            TTL: 60 * 60,
            urgency: 'high',
            ...(topic ? { topic } : {}),
          });
          delivered += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // The browser unsubscribed or the endpoint expired; forget it.
            await deletePushEndpoint(db, device.endpoint);
          } else {
            failures.push(error instanceof Error ? error.message : String(error));
            logger.warn(
              `[notify] push to ${new URL(device.endpoint).host} failed: ${failures.at(-1) ?? ''}`,
            );
          }
        }
      }
      if (delivered === 0)
        throw new Error(failures[0] ?? 'All push endpoints were gone or invalid');
      return delivered;
    },
  };
}
