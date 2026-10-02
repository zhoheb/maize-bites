import {
  eventDetailSchema,
  healthResponseSchema,
  listEventsResponseSchema,
  startOfNextLocalDay,
  type EventDetail,
  type HealthResponse,
  type ListEventsResponse,
} from '@maize-bites/shared';
import { toApiParams, type Filters, type Tab } from '../lib/filters';
import { getJson, type RequestOptions } from './client';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const PAGE_SIZE = 30;

/** Endpoint and time window for each Home tab. The server treats `from` as "now" by default. */
export function tabRequest(tab: Tab, now: Date): { path: string; params: Record<string, string> } {
  switch (tab) {
    case 'now':
      return { path: '/api/events/now', params: {} };
    case 'today':
      return { path: '/api/events', params: { to: startOfNextLocalDay(now).toISOString() } };
    case 'week':
      return {
        path: '/api/events',
        params: { to: new Date(now.getTime() + WEEK_MS).toISOString() },
      };
  }
}

export function fetchEventPage(
  tab: Tab,
  filters: Filters,
  cursor: string | null,
  options: Pick<RequestOptions, 'signal' | 'fetchFn'> & { now?: Date } = {},
): Promise<ListEventsResponse> {
  const { path, params } = tabRequest(tab, options.now ?? new Date());
  return getJson(path, listEventsResponseSchema, {
    ...options,
    params: {
      ...params,
      ...toApiParams(filters),
      limit: String(PAGE_SIZE),
      cursor: cursor ?? undefined,
    },
  });
}

export function fetchEventDetail(
  id: string,
  options: Pick<RequestOptions, 'signal'> = {},
): Promise<EventDetail> {
  return getJson(`/api/events/${encodeURIComponent(id)}`, eventDetailSchema, options);
}

/** A stale pipeline may answer 503 with the same body; that's still useful for the "updated" stamp. */
export function fetchHealth(options: Pick<RequestOptions, 'signal'> = {}): Promise<HealthResponse> {
  return getJson('/api/health', healthResponseSchema, { ...options, acceptStatuses: [503] });
}

export const icsUrl = (id: string) => `/api/events/${encodeURIComponent(id)}/ics`;
