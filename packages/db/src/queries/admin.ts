import { PUBLISH_CONFIDENCE, REVIEW_CONFIDENCE, type EventSource } from '@maize-bites/shared';
import { and, asc, desc, eq, exists, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  auditLog,
  buildings,
  classifications,
  events,
  ingestionRuns,
  locationMisses,
  notificationLog,
  reviewFlags,
  users,
  type AuditLogRow,
  type BuildingRow,
  type ClassificationRow,
  type IngestionRunRow,
  type LocationMissRow,
} from '../schema.js';
import { activeClassificationLateral } from './internal.js';

// ── Audit log ─────────────────────────────────────────────────────────────

export async function recordAudit(
  db: Database,
  entry: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    details?: Record<string, unknown>;
    at: Date;
  },
): Promise<void> {
  const { at, ...rest } = entry;
  await db.insert(auditLog).values({ ...rest, details: rest.details ?? {}, createdAt: at });
}

export async function listAuditLog(
  db: Database,
  limit = 50,
): Promise<(AuditLogRow & { actorEmail: string | null })[]> {
  const rows = await db
    .select({ entry: auditLog, actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.entry, actorEmail: r.actorEmail }));
}

// ── Pipeline health ───────────────────────────────────────────────────────

export function listIngestionRuns(db: Database, limit = 20): Promise<IngestionRunRow[]> {
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(limit);
}

export function listLocationMisses(db: Database, limit = 100): Promise<LocationMissRow[]> {
  return db.select().from(locationMisses).orderBy(desc(locationMisses.seenCount)).limit(limit);
}

// ── Buildings ─────────────────────────────────────────────────────────────

export function listBuildings(db: Database): Promise<BuildingRow[]> {
  return db.select().from(buildings).orderBy(asc(buildings.name));
}

/** Adds an alias unless the building already has it (case-insensitive). Returns the building. */
export async function addBuildingAlias(
  db: Database,
  buildingId: string,
  alias: string,
): Promise<BuildingRow | null> {
  const [row] = await db
    .update(buildings)
    .set({
      aliases: sql`case when exists (select 1 from unnest(${buildings.aliases}) a where lower(a) = lower(${alias}))
        then ${buildings.aliases} else array_append(${buildings.aliases}, ${alias}::text) end`,
    })
    .where(eq(buildings.id, buildingId))
    .returning();
  return row ?? null;
}

// ── Classifier stats ──────────────────────────────────────────────────────

export type EventOutcome =
  | 'published'
  | 'review'
  | 'rejected_rules'
  | 'rejected_llm'
  | 'hidden_by_admin'
  | 'pending_llm'
  | 'unclassified';

/** Where an event ended up. Mirrors listPublishedEvents and listReviewQueue. */
export function classifyOutcome(input: {
  source: EventSource;
  active: Pick<ClassificationRow, 'method' | 'hasFreeFood' | 'confidence'> | null;
  flagged: boolean;
}): EventOutcome {
  const { source, active, flagged } = input;
  if (active?.method === 'manual') return active.hasFreeFood ? 'published' : 'hidden_by_admin';
  if (source === 'submission') return 'published';
  if (flagged) return 'review';
  if (!active) return 'unclassified';
  if (active.hasFreeFood && active.confidence >= PUBLISH_CONFIDENCE) return 'published';
  if (active.method === 'rules') return active.hasFreeFood ? 'pending_llm' : 'rejected_rules';
  if (active.hasFreeFood && active.confidence >= REVIEW_CONFIDENCE) return 'review';
  return 'rejected_llm';
}

export interface ClassifierStats {
  window: { from: string; to: string };
  events: number;
  outcomes: Record<EventOutcome, number>;
  llmClassifications: number;
  alerts: { sent: number; failed: number };
}

/** Outcomes for events starting in [from, to], plus LLM and alert volume since `from`. */
export async function classifierStats(
  db: Database,
  window: { from: Date; to: Date },
): Promise<ClassifierStats> {
  const active = activeClassificationLateral(db);
  const rows = await db
    .select({
      source: events.source,
      method: active.method,
      hasFreeFood: active.hasFreeFood,
      confidence: active.confidence,
      flagged: exists(
        db
          .select({ one: sql`1` })
          .from(reviewFlags)
          .where(
            and(
              eq(reviewFlags.eventId, events.id),
              eq(reviewFlags.contentHash, events.contentHash),
              sql`${reviewFlags.resolvedAt} is null`,
            ),
          ),
      ).mapWith(Boolean),
    })
    .from(events)
    .leftJoinLateral(active, sql`true`)
    .where(
      and(
        gte(events.startsAt, window.from),
        lte(events.startsAt, window.to),
        eq(events.status, 'active'),
      ),
    );

  const outcomes: Record<EventOutcome, number> = {
    published: 0,
    review: 0,
    rejected_rules: 0,
    rejected_llm: 0,
    hidden_by_admin: 0,
    pending_llm: 0,
    unclassified: 0,
  };
  for (const r of rows) {
    const act =
      r.method === null || r.hasFreeFood === null || r.confidence === null
        ? null
        : { method: r.method, hasFreeFood: r.hasFreeFood, confidence: r.confidence };
    outcomes[classifyOutcome({ source: r.source, active: act, flagged: r.flagged })] += 1;
  }

  const llmClassifications = await db.$count(
    classifications,
    and(eq(classifications.method, 'llm'), gte(classifications.createdAt, window.from)),
  );
  const [alerts] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${notificationLog.error} is null)`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${notificationLog.error} is not null)`.mapWith(
        Number,
      ),
    })
    .from(notificationLog)
    .where(gte(notificationLog.sentAt, window.from));

  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    events: rows.length,
    outcomes,
    llmClassifications,
    alerts: alerts ?? { sent: 0, failed: 0 },
  };
}
