import { shouldAutoPublish } from '@maize-bites/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  buildings,
  events,
  submissions,
  users,
  type EventRow,
  type SubmissionRow,
} from '../schema.js';
import { computeContentHash } from '../content-hash.js';

export interface TipInput {
  title: string;
  description: string | null;
  buildingId: string;
  room: string | null;
  startsAt: Date;
  endsAt: Date | null;
}

export class SubmissionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionStateError';
  }
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Creates the event for an approved tip and bumps the submitter's trust. Runs inside `tx`. */
async function approveInTx(
  tx: Tx,
  submission: SubmissionRow,
  reviewer: { id: string } | null,
  now: Date,
): Promise<EventRow> {
  const content = {
    title: submission.title,
    description: submission.description,
    startsAt: submission.startsAt,
    endsAt: submission.endsAt,
    locationName: submission.locationName,
    room: submission.room,
  };
  const [event] = await tx
    .insert(events)
    .values({
      source: 'submission',
      sourceEventId: submission.id,
      occurrenceId: '0',
      ...content,
      buildingId: submission.buildingId,
      contentHash: computeContentHash(content),
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning();
  if (!event) throw new Error('insert returned no row');
  await tx
    .update(submissions)
    .set({
      status: 'approved',
      eventId: event.id,
      reviewedBy: reviewer?.id ?? null,
      reviewedAt: now,
    })
    .where(eq(submissions.id, submission.id));
  await tx
    .update(users)
    .set({ trustLevel: sql`${users.trustLevel} + 1` })
    .where(eq(users.id, submission.userId));
  return event;
}

/**
 * Records a tip. Trusted users (AUTO_PUBLISH_TRUST_LEVEL approved tips) are published
 * immediately; everyone else waits in the review queue.
 */
export async function submitTip(
  db: Database,
  user: { id: string; trustLevel: number },
  tip: TipInput,
  now: Date,
): Promise<{ submission: SubmissionRow; event: EventRow | null }> {
  return db.transaction(async (tx) => {
    const [building] = await tx
      .select({ name: buildings.name })
      .from(buildings)
      .where(eq(buildings.id, tip.buildingId));
    if (!building) throw new SubmissionStateError('Unknown building');
    const [submission] = await tx
      .insert(submissions)
      .values({ userId: user.id, ...tip, locationName: building.name, createdAt: now })
      .returning();
    if (!submission) throw new Error('insert returned no row');
    if (!shouldAutoPublish(user.trustLevel)) return { submission, event: null };
    const event = await approveInTx(tx, submission, null, now);
    const [approved] = await tx.select().from(submissions).where(eq(submissions.id, submission.id));
    return { submission: approved ?? submission, event };
  });
}

async function lockPending(tx: Tx, id: string): Promise<SubmissionRow> {
  const [row] = await tx.select().from(submissions).where(eq(submissions.id, id)).for('update');
  if (!row) throw new SubmissionStateError('Submission not found');
  if (row.status !== 'pending')
    throw new SubmissionStateError(`Submission is already ${row.status}`);
  return row;
}

export function approveSubmission(
  db: Database,
  id: string,
  reviewer: { id: string },
  now: Date,
): Promise<EventRow> {
  return db.transaction(async (tx) => approveInTx(tx, await lockPending(tx, id), reviewer, now));
}

export async function rejectSubmission(
  db: Database,
  id: string,
  reviewer: { id: string },
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockPending(tx, id);
    await tx
      .update(submissions)
      .set({ status: 'rejected', reviewedBy: reviewer.id, reviewedAt: now })
      .where(eq(submissions.id, id));
  });
}

export interface PendingSubmission {
  submission: SubmissionRow;
  submitter: { email: string; trustLevel: number };
  building: { id: string; name: string } | null;
}

export async function listPendingSubmissions(db: Database): Promise<PendingSubmission[]> {
  const rows = await db
    .select({
      submission: submissions,
      email: users.email,
      trustLevel: users.trustLevel,
      buildingId: buildings.id,
      buildingName: buildings.name,
    })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.userId))
    .leftJoin(buildings, eq(buildings.id, submissions.buildingId))
    .where(and(eq(submissions.status, 'pending')))
    .orderBy(asc(submissions.createdAt));
  return rows.map((r) => ({
    submission: r.submission,
    submitter: { email: r.email, trustLevel: r.trustLevel },
    building: r.buildingId && r.buildingName ? { id: r.buildingId, name: r.buildingName } : null,
  }));
}
