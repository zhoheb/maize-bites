import {
  claimNotification,
  listPublishedEvents,
  listSubscribers,
  publishedAt,
  recordNotificationError,
  toFoodEvent,
  type Database,
  type PublishedEvent,
} from '@maize-bites/db';
import {
  digestEmail,
  eventWhen,
  eventWhere,
  instantAlertEmail,
  type LinkBuilder,
} from '@maize-bites/email';
import {
  CAMPUS_TIME_ZONE,
  startOfNextLocalDay,
  type Channel,
  type FoodEvent,
} from '@maize-bites/shared';
import type { Logger } from '../scheduler.js';
import type { Delivery } from './delivery.js';
import { isNewForSubscriber, isQuietTime, matchesFilters } from './match.js';

export interface NotifyDeps {
  db: Database;
  delivery: Delivery;
  logger: Logger;
  /** Public web origin, for links. */
  webOrigin: string;
  now: Date;
}

export interface NotifyStats {
  sent: number;
  failed: number;
  /** Matched but inside the subscriber's quiet hours; retried next run. */
  deferredQuiet: number;
}

export function links(webOrigin: string): LinkBuilder {
  return { event: (id) => `${webOrigin}/events/${id}`, manage: `${webOrigin}/alerts` };
}

/** Every published event that hasn't ended, across pages. */
async function allPublished(
  db: Database,
  filters: { from: Date; to?: Date },
): Promise<PublishedEvent[]> {
  const out: PublishedEvent[] = [];
  let after: { startsAt: Date; id: string } | undefined;
  do {
    const page = await listPublishedEvents(db, { ...filters, limit: 100, after });
    out.push(...page.items);
    after = page.nextCursor ?? undefined;
  } while (after);
  return out;
}

async function deliver(
  deps: NotifyDeps,
  key: { userId: string; eventId: string; channel: Channel },
  send: () => Promise<unknown>,
  stats: NotifyStats,
): Promise<void> {
  try {
    await send();
    stats.sent += 1;
  } catch (error) {
    stats.failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    await recordNotificationError(deps.db, key, message);
    deps.logger.warn(`[notify] ${key.channel} to user ${key.userId} failed: ${message}`);
  }
}

const pushFor = (event: FoodEvent) => ({
  title:
    event.foodItems.length > 0
      ? `Free ${event.foodItems.slice(0, 2).join(' & ')}`
      : 'Free food nearby',
  body: `${event.title} · ${eventWhere(event)} · ${eventWhen(event)}`,
  url: `/events/${event.id}`,
  tag: event.id,
});

/**
 * Instant alerts for newly published events. For each (subscriber, event, channel) that
 * matches and isn't in quiet hours: claim it in notification_log first, and send only if the
 * claim is new. A crashed or repeated run therefore never double-alerts.
 */
export async function runInstantAlerts(deps: NotifyDeps): Promise<NotifyStats> {
  const stats: NotifyStats = { sent: 0, failed: 0, deferredQuiet: 0 };
  const subscribers = await listSubscribers(deps.db, 'instant');
  if (subscribers.length === 0) return stats;
  const events = await allPublished(deps.db, { from: deps.now });
  const link = links(deps.webOrigin);

  for (const { subscription: sub, email } of subscribers) {
    for (const published of events) {
      if (!isNewForSubscriber(publishedAt(published), sub.createdAt)) continue;
      const event = toFoodEvent(published);
      if (!matchesFilters(event, sub)) continue;
      if (isQuietTime(deps.now, sub.quietStart, sub.quietEnd)) {
        stats.deferredQuiet += 1;
        continue; // Not claimed, so a later run sends it if the event is still on.
      }
      const key = { userId: sub.userId, eventId: event.id, channel: sub.channel };
      if (!(await claimNotification(deps.db, { ...key, kind: 'instant', sentAt: deps.now })))
        continue;
      await deliver(
        deps,
        key,
        () =>
          sub.channel === 'email'
            ? deps.delivery.email({ to: email, ...instantAlertEmail(event, link) })
            : deps.delivery.push(sub.userId, pushFor(event)),
        stats,
      );
    }
  }
  if (stats.sent + stats.failed + stats.deferredQuiet > 0) {
    deps.logger.info(
      `[notify] instant: ${stats.sent} sent, ${stats.failed} failed, ${stats.deferredQuiet} deferred (quiet hours)`,
    );
  }
  return stats;
}

const dayLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/**
 * Morning digest: one message per digest subscriber and channel with today's matching events
 * they haven't been sent. Events are claimed in notification_log (kind "digest") before the
 * send, so re-running the job the same day sends nothing new. Quiet hours don't apply: the
 * digest is the schedule the subscriber chose.
 */
export async function runDigest(deps: NotifyDeps): Promise<NotifyStats> {
  const stats: NotifyStats = { sent: 0, failed: 0, deferredQuiet: 0 };
  const subscribers = await listSubscribers(deps.db, 'digest');
  if (subscribers.length === 0) return stats;
  const today = (
    await allPublished(deps.db, { from: deps.now, to: startOfNextLocalDay(deps.now) })
  ).map(toFoodEvent);
  const link = links(deps.webOrigin);

  for (const { subscription: sub, email } of subscribers) {
    const claimed: FoodEvent[] = [];
    for (const event of today) {
      if (!matchesFilters(event, sub)) continue;
      const key = { userId: sub.userId, eventId: event.id, channel: sub.channel };
      if (await claimNotification(deps.db, { ...key, kind: 'digest', sentAt: deps.now }))
        claimed.push(event);
    }
    const first = claimed[0];
    if (!first) continue;
    const key = { userId: sub.userId, eventId: first.id, channel: sub.channel };
    await deliver(
      deps,
      key,
      () =>
        sub.channel === 'email'
          ? deps.delivery.email({
              to: email,
              ...digestEmail(claimed, dayLabel.format(deps.now), link),
            })
          : deps.delivery.push(sub.userId, {
              title: `${claimed.length} free food event${claimed.length === 1 ? '' : 's'} today`,
              body: claimed
                .slice(0, 3)
                .map((e) => e.title)
                .join(' · '),
              url: '/?tab=today',
              tag: `digest-${dayLabel.format(deps.now)}`,
            }),
      stats,
    );
  }
  deps.logger.info(`[notify] digest: ${stats.sent} sent, ${stats.failed} failed`);
  return stats;
}
