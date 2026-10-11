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

// The API runs on a host that puts it to sleep when idle and takes about a minute to wake it.
// While it wakes, requests fail at the network or come back 502/503/504 from the proxy in
// front. Those are worth waiting out; other failures are not.

/** Retries for a request that looks like the API waking up. With the delays below: about 70 s. */
export const WAKING_RETRIES = 8;

/** True for failures a sleeping or restarting API produces: no response, or a gateway error. */
export function looksLikeWaking(error: unknown): boolean {
  if (error instanceof ApiRequestError) return [502, 503, 504].includes(error.status);
  // fetch() rejects with a TypeError when there is no response at all. (A cancelled request is
  // an AbortError, which TanStack Query never retries.)
  return error instanceof TypeError;
}

/**
 * Don't retry client errors (400/404). Keep trying through a cold start. Retry anything else
 * (a 500, a malformed body) once.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status < 500) return false;
  return failureCount < (looksLikeWaking(error) ? WAKING_RETRIES : 1);
}

/** 2 s, 4 s, 8 s, then every 10 s. */
export function retryDelay(attempt: number): number {
  return Math.min(2000 * 2 ** attempt, 10_000);
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
