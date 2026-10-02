import {
  AUDIENCES,
  CAMPUSES,
  CHANNELS,
  CLASSIFICATION_METHODS,
  EVENT_SOURCES,
  EVENT_STATUSES,
  REPORT_KINDS,
  SUBMISSION_STATUSES,
  SUBSCRIPTION_MODES,
} from '@maize-bites/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from './client.js';
import { upsertEvent } from './queries/events.js';
import {
  audience,
  campus,
  channel,
  classificationMethod,
  eventSource,
  eventStatus,
  notificationLog,
  reportKind,
  reports,
  submissionStatus,
  subscriptionMode,
  users,
} from './schema.js';
import { createTestDb, eventInput, insertClassification } from './testing.js';

describe('pg enums match @maize-bites/shared', () => {
  it.each([
    ['event_source', eventSource.enumValues, EVENT_SOURCES],
    ['event_status', eventStatus.enumValues, EVENT_STATUSES],
    ['classification_method', classificationMethod.enumValues, CLASSIFICATION_METHODS],
    ['audience', audience.enumValues, AUDIENCES],
    ['campus', campus.enumValues, CAMPUSES],
    ['channel', channel.enumValues, CHANNELS],
    ['report_kind', reportKind.enumValues, REPORT_KINDS],
    ['submission_status', submissionStatus.enumValues, SUBMISSION_STATUSES],
    ['subscription_mode', subscriptionMode.enumValues, SUBSCRIPTION_MODES],
  ])('%s', (_name, dbValues, sharedValues) => {
    expect(dbValues).toEqual(sharedValues);
  });
});

describe('constraints', () => {
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(async () => {
    await handle.close();
  });

  async function fixtures() {
    const { db } = handle;
    const [user] = await db.insert(users).values({ email: 'wolverine@umich.edu' }).returning();
    const { event } = await upsertEvent(db, eventInput());
    if (!user) throw new Error('no user');
    return { user, event };
  }

  it('notification_log allows one alert per (user, event, channel)', async () => {
    const { db } = handle;
    const { user, event } = await fixtures();
    const row = { userId: user.id, eventId: event.id };
    await db.insert(notificationLog).values({ ...row, channel: 'email' });
    await db.insert(notificationLog).values({ ...row, channel: 'push' });

    await expect(db.insert(notificationLog).values({ ...row, channel: 'email' })).rejects.toThrow();

    // The idempotent send path the notifier will use:
    const inserted = await db
      .insert(notificationLog)
      .values({ ...row, channel: 'email' })
      .onConflictDoNothing()
      .returning();
    expect(inserted).toEqual([]);
  });

  it('reports allow one vote per (event, user, kind)', async () => {
    const { db } = handle;
    const { user, event } = await fixtures();
    const row = { eventId: event.id, userId: user.id, kind: 'food_gone' as const };
    await db.insert(reports).values(row);

    await expect(db.insert(reports).values(row)).rejects.toThrow();
    await db.insert(reports).values({ ...row, kind: 'still_food' });
  });

  it.each(['someone@gmail.com', 'Wolverine@umich.edu', 'x@umich.edu.evil.com', 'x@med.umich.edu'])(
    'users rejects email %s',
    async (email) => {
      await expect(handle.db.insert(users).values({ email })).rejects.toThrow();
    },
  );

  it('classifications.confidence must be within [0, 1]', async () => {
    const { event } = await fixtures();
    await expect(insertClassification(handle.db, event, { confidence: 1.5 })).rejects.toThrow();
    await expect(insertClassification(handle.db, event, { confidence: -0.1 })).rejects.toThrow();
  });

  it('events.ends_at cannot precede starts_at', async () => {
    const startsAt = new Date('2026-10-01T16:00:00Z');
    await expect(
      upsertEvent(handle.db, eventInput({ startsAt, endsAt: new Date('2026-10-01T15:00:00Z') })),
    ).rejects.toThrow();
  });
});
