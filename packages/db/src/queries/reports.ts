import { REPORT_KINDS, type ReportKind } from '@maize-bites/shared';
import { count, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { reports } from '../schema.js';

/** Report counts for one event occurrence, with every kind present (0 when none). */
export async function countReportsByKind(
  db: Database,
  eventId: string,
): Promise<Record<ReportKind, number>> {
  const rows = await db
    .select({ kind: reports.kind, n: count() })
    .from(reports)
    .where(eq(reports.eventId, eventId))
    .groupBy(reports.kind);
  const counts = Object.fromEntries(REPORT_KINDS.map((k) => [k, 0])) as Record<ReportKind, number>;
  for (const { kind, n } of rows) counts[kind] = n;
  return counts;
}

/** One report of each kind per user per event (unique index). Returns whether it was new. */
export async function addReport(
  db: Database,
  report: { eventId: string; userId: string; kind: ReportKind; createdAt: Date },
): Promise<boolean> {
  const rows = await db
    .insert(reports)
    .values(report)
    .onConflictDoNothing({ target: [reports.eventId, reports.userId, reports.kind] })
    .returning({ id: reports.id });
  return rows.length > 0;
}
