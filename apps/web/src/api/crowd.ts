import {
  buildingsResponseSchema,
  reportResponseSchema,
  submissionResponseSchema,
  type EventDetail,
  type ReportKind,
  type SubmissionRequest,
} from '@maize-bites/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson } from './client';
import { sendJson } from './mutations';
import { queryKeys } from './queries';

/** Campus buildings for the tip form. They rarely change, so one fetch per visit. */
export function useBuildings(enabled = true) {
  return useQuery({
    queryKey: ['buildings'] as const,
    queryFn: async ({ signal }) =>
      (await getJson('/api/buildings', buildingsResponseSchema, { signal })).buildings,
    staleTime: Infinity,
    enabled,
  });
}

export function useSubmitTip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (tip: SubmissionRequest) => {
      const saved = await sendJson('POST', '/api/submissions', tip, submissionResponseSchema);
      if (!saved) throw new Error('Empty response');
      return saved;
    },
    onSuccess: (saved) => {
      // A trusted user's tip is live at once; refresh the lists so it shows.
      if (saved.eventId) void client.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

/**
 * Reports on one event. Optimistic: the count goes up the moment the button is pressed, the
 * server's answer then replaces it, and a failure puts back what was there.
 */
export function useReport(eventId: string) {
  const client = useQueryClient();
  const key = queryKeys.event(eventId);
  return useMutation({
    mutationFn: async (kind: ReportKind) => {
      const result = await sendJson(
        'POST',
        `/api/events/${encodeURIComponent(eventId)}/reports`,
        { kind },
        reportResponseSchema,
      );
      if (!result) throw new Error('Empty response');
      return result;
    },
    onMutate: async (kind) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<EventDetail>(key);
      if (before) {
        client.setQueryData<EventDetail>(key, {
          ...before,
          reportCounts: { ...before.reportCounts, [kind]: before.reportCounts[kind] + 1 },
          lastReportAt: new Date().toISOString(),
        });
      }
      return { before };
    },
    onError: (_error, _kind, context) => {
      if (context?.before) client.setQueryData(key, context.before);
    },
    onSuccess: (result) => {
      client.setQueryData<EventDetail>(key, (event) => (event ? { ...event, ...result } : event));
      void client.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
