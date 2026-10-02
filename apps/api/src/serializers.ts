import { toFoodEvent, type PublishedEvent } from '@maize-bites/db';
import type { EventDetail, ReportCounts } from '@maize-bites/shared';

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
