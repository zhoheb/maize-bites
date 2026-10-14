import {
  adminAnalyticsResponseSchema,
  adminMetricsResponseSchema,
  analyticsSettingsSchema,
  buildingSchema,
  overrideResponseSchema,
  reviewQueueResponseSchema,
  reviewSubmissionResponseSchema,
  type AnalyticsRange,
  type AnalyticsSettings,
  type OverrideRequest,
} from '@maize-bites/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson } from './client';
import { sendJson } from './mutations';

const adminKeys = {
  all: ['admin'] as const,
  queue: ['admin', 'review-queue'] as const,
  metrics: ['admin', 'metrics'] as const,
  analytics: ['admin', 'analytics'] as const,
};

export function useReviewQueue(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.queue,
    queryFn: ({ signal }) =>
      getJson('/api/admin/review-queue', reviewQueueResponseSchema, { signal }),
    enabled,
  });
}

export function useAdminMetrics(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.metrics,
    queryFn: ({ signal }) => getJson('/api/admin/metrics', adminMetricsResponseSchema, { signal }),
    enabled,
    refetchInterval: 60_000,
  });
}

/** Every admin write changes what the queue, the metrics, and the public lists show. */
function useAdminMutation<Input>(send: (input: Input) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.all });
      void client.invalidateQueries({ queryKey: ['events'] });
      void client.invalidateQueries({ queryKey: ['event'] });
    },
  });
}

export function useOverrideEvent() {
  return useAdminMutation(({ eventId, ...override }: OverrideRequest & { eventId: string }) =>
    sendJson(
      'POST',
      `/api/admin/events/${encodeURIComponent(eventId)}/override`,
      override,
      overrideResponseSchema,
    ),
  );
}

export function useReviewSubmission() {
  return useAdminMutation(({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
    sendJson(
      'POST',
      `/api/admin/submissions/${encodeURIComponent(id)}`,
      { action },
      reviewSubmissionResponseSchema,
    ),
  );
}

export function useAddAlias() {
  return useAdminMutation(({ buildingId, alias }: { buildingId: string; alias: string }) =>
    sendJson(
      'POST',
      `/api/admin/buildings/${encodeURIComponent(buildingId)}/aliases`,
      { alias },
      buildingSchema,
    ),
  );
}

export function useAdminAnalytics(range: AnalyticsRange, enabled: boolean) {
  return useQuery({
    queryKey: [...adminKeys.analytics, range],
    queryFn: ({ signal }) =>
      getJson(`/api/admin/analytics?range=${range}`, adminAnalyticsResponseSchema, { signal }),
    enabled,
    refetchInterval: 5 * 60_000,
  });
}

export function useAnalyticsSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: AnalyticsSettings) =>
      sendJson('PUT', '/api/admin/analytics/settings', settings, analyticsSettingsSchema),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.analytics }),
  });
}
