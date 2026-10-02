import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Filters, Tab } from '../lib/filters';
import { ApiRequestError } from './client';
import { fetchEventDetail, fetchEventPage, fetchHealth } from './events';

const FIVE_MINUTES = 5 * 60_000;

export const queryKeys = {
  events: (tab: Tab, filters: Filters) => ['events', tab, filters] as const,
  event: (id: string) => ['event', id] as const,
  health: ['health'] as const,
};

/** Don't retry client errors (400/404); retry network and 5xx once. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status < 500) return false;
  return failureCount < 1;
}

export function useEventsInfinite(tab: Tab, filters: Filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.events(tab, filters),
    queryFn: ({ pageParam, signal }) => fetchEventPage(tab, filters, pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: FIVE_MINUTES,
    placeholderData: keepPreviousData,
  });
}

export function useEventDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.event(id),
    queryFn: ({ signal }) => fetchEventDetail(id, { signal }),
    refetchInterval: FIVE_MINUTES,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => fetchHealth({ signal }),
    refetchInterval: 60_000,
  });
}
