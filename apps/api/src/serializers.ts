import {
  toFoodEvent,
  type ClassificationRow,
  type EventRow,
  type IngestionRunRow,
  type PublishedEvent,
} from '@maize-bites/db';
import {
  EVENT_SOURCES,
  type AdminMetricsResponse,
  type EventDetail,
  type ReportCounts,
  type ReviewQueueResponse,
  type SourceHealth,
} from '@maize-bites/shared';

export function toEventDetail(published: PublishedEvent, reportCounts: ReportCounts): EventDetail {
  const { classification } = published;
  return {
    ...toFoodEvent(published),
    classification: classification && {
      method: classification.method,
      confidence: classification.confidence,
      evidence: classification.evidence,
      classifiedAt: classification.createdAt.toISOString(),
    },
    reportCounts,
  };
}

type QueueEvent = ReviewQueueResponse['events'][number];

export function toAdminEvent(event: EventRow): QueueEvent['event'] {
  return {
    id: event.id,
    source: event.source,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    locationName: event.locationName,
    url: event.url,
  };
}

export function toAdminClassification(
  c: ClassificationRow,
): NonNullable<QueueEvent['classification']> {
  return {
    method: c.method,
    model: c.model,
    hasFreeFood: c.hasFreeFood,
    confidence: c.confidence,
    foodItems: c.foodItems,
    mealType: c.mealType,
    dietary: c.dietary,
    audience: c.audience,
    evidence: c.evidence,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toRun(run: IngestionRunRow): AdminMetricsResponse['runs'][number] {
  return {
    id: run.id,
    source: run.source,
    notModified: run.notModified,
    skippedDuplicates: run.skippedDuplicates,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    fetched: run.fetched,
    created: run.created,
    updated: run.updated,
    classified: run.classified,
    removed: run.removed,
    complete: run.complete,
    errors: run.errors,
    errorMessages: run.errorMessages,
  };
}

/** Per-source health from recent runs (newest first). Sources with no runs are left out. */
export function summarizeSources(runs: readonly IngestionRunRow[]): SourceHealth[] {
  return EVENT_SOURCES.flatMap((source) => {
    if (source === 'submission') return [];
    const own = runs.filter((r) => r.source === source);
    const [latest] = own;
    if (!latest) return [];
    const lastSuccess = own.find((r) => r.complete && r.finishedAt !== null);
    return [
      {
        source,
        lastRunAt: latest.startedAt.toISOString(),
        lastSuccessAt: lastSuccess?.finishedAt?.toISOString() ?? null,
        lastError: latest.errorMessages[0] ?? null,
        recentRuns: own.length,
        recentComplete: own.filter((r) => r.complete).length,
      },
    ];
  });
}
