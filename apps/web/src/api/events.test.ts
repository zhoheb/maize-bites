import { describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../test/fixtures';
import { ApiRequestError } from './client';
import { fetchEventPage, fetchHealth, tabRequest } from './events';
import { NO_FILTERS } from '../lib/filters';

const NOW = new Date('2026-10-01T16:00:00Z'); // noon in Ann Arbor

function fakeFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));
}

describe('tabRequest', () => {
  it('maps tabs to endpoints and windows', () => {
    expect(tabRequest('now', NOW)).toEqual({ path: '/api/events/now', params: {} });
    expect(tabRequest('today', NOW)).toEqual({
      path: '/api/events',
      params: { to: '2026-10-02T04:00:00.000Z' },
    });
    expect(tabRequest('week', NOW)).toEqual({
      path: '/api/events',
      params: { to: '2026-10-08T16:00:00.000Z' },
    });
  });
});

describe('fetchEventPage', () => {
  it('sends filters, page size, and cursor, and validates the response', async () => {
    const fetchFn = fakeFetch({ events: [makeEvent()], nextCursor: 'abc' });

    const page = await fetchEventPage(
      'today',
      { ...NO_FILTERS, campuses: ['north'], openOnly: true },
      'c1',
      { fetchFn, now: NOW },
    );

    expect(page.nextCursor).toBe('abc');
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      '/api/events?to=2026-10-02T04%3A00%3A00.000Z&campus=north&open_only=true&limit=30&cursor=c1',
    );
  });

  it('rejects responses that do not match the shared schema', async () => {
    const fetchFn = fakeFetch({ events: [{ ...makeEvent(), startsAt: 'soon' }], nextCursor: null });
    await expect(fetchEventPage('now', NO_FILTERS, null, { fetchFn })).rejects.toThrow();
  });

  it('surfaces the API error code and request id', async () => {
    const fetchFn = fakeFetch(
      { error: { code: 'invalid_request', message: 'Invalid request', requestId: 'r1' } },
      400,
    );
    const error = await fetchEventPage('now', NO_FILTERS, null, { fetchFn }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 400, code: 'invalid_request', requestId: 'r1' });
  });
});

describe('fetchHealth', () => {
  it('accepts a 503 that still carries a health body', async () => {
    const body = {
      status: 'degraded',
      database: 'ok',
      lastSuccessfulIngestionAt: null,
      ingestionStale: true,
    };
    vi.stubGlobal('fetch', fakeFetch(body, 503));
    try {
      await expect(fetchHealth()).resolves.toEqual(body);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
