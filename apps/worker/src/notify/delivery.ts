import { deletePushEndpoint, listPushSubscriptions, type Database } from '@maize-bites/db';
import type { EmailMessage, Mailer } from '@maize-bites/email';
import type { PushPayload } from '@maize-bites/shared';
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
      let delivered = 0;
      const failures: string[] = [];
      for (const device of devices) {
        try {
          await sendPush(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            JSON.stringify(payload),
            { vapidDetails: vapid, TTL: 60 * 60, urgency: 'high', topic: payload.tag.slice(0, 32) },
          );
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
      if (delivered === 0) throw new Error(failures[0] ?? 'All push endpoints were gone');
      return delivered;
    },
  };
}
