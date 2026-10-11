import { describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../test/fixtures';
import { ApiRequestError } from './client';
import { fetchEventPage, fetchHealth, tabRequest, withoutDemo } from './events';
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
      '/api/events?to=2026-10-02T04%3A00%3A00.000Z&campus=north&open_only=true&limit=100&cursor=c1',
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

describe('demo events', () => {
  const real = makeEvent({ title: 'Pizza at the Dude' });
  const demo = makeEvent({ id: '00000000-0000-4000-8000-000000000009', title: '[demo] Pizza' });
  const page = { events: [real, demo], nextCursor: null };

  it('are dropped unless the page was started with VITE_SHOW_DEMO=true', async () => {
    const hidden = await fetchEventPage('now', NO_FILTERS, null, {
      fetchFn: fakeFetch(page),
      showDemo: false,
    });
    expect(hidden.events.map((e) => e.title)).toEqual(['Pizza at the Dude']);

    const shown = await fetchEventPage('now', NO_FILTERS, null, {
      fetchFn: fakeFetch(page),
      showDemo: true,
    });
    expect(shown.events).toHaveLength(2);
  });

  it('are hidden by default', async () => {
    // No VITE_SHOW_DEMO in the test environment, as in production.
    const result = await fetchEventPage('now', NO_FILTERS, null, { fetchFn: fakeFetch(page) });
    expect(result.events.map((e) => e.title)).toEqual(['Pizza at the Dude']);
  });

  it('withoutDemo keeps the cursor and matches only the title prefix', () => {
    const mention = makeEvent({ title: 'Cooking [demo] night' });
    expect(withoutDemo({ events: [demo, mention], nextCursor: 'c2' }, false)).toEqual({
      events: [mention],
      nextCursor: 'c2',
    });
  });
});

describe('fetchHealth', () => {
  it('accepts a 503 that still carries a health body', async () => {
    const body = {
      status: 'degraded',
      database: 'ok',
      lastSuccessfulIngestionAt: null,
      ingestionStale: true,
      sources: [],
    };
    vi.stubGlobal('fetch', fakeFetch(body, 503));
    try {
      await expect(fetchHealth()).resolves.toEqual(body);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
