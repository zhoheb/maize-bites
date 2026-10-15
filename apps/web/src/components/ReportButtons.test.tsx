import type { EventDetail } from '@maize-bites/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIGNED_IN, SIGNED_OUT, apiError, mockApi, renderApp } from '../test/api-mock';
import { makeDetail, makeEvent } from '../test/fixtures';
import { EventDetails } from './EventDetails';

afterEach(() => {
  vi.unstubAllGlobals();
});

const event = makeEvent();
const detail = (overrides: Partial<EventDetail> = {}): EventDetail =>
  makeDetail({
    reportCounts: { food_gone: 2, still_food: 1, not_free: 0, wrong_info: 0, wrong_audience: 0 },
    ...overrides,
  });
const PATH = `/api/events/${event.id}`;
const renderDetails = () => renderApp(<EventDetails id={event.id} titleId="t" />);
/** A paragraph by its whole text, which the <time> inside it splits across nodes. */
const paragraph = (text: string) =>
  screen.findByText((_, node) => node?.tagName === 'P' && node.textContent === text);

describe('report buttons in event details', () => {
  it('shows live counts for each kind of report', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, [`GET ${PATH}`]: detail() });
    renderDetails();

    expect(await screen.findByRole('button', { name: "Food's gone, 2 reports" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Still food, 1 report' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not free, 0 reports' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wrong info, 0 reports' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wrong audience, 0 reports' })).toBeTruthy();
  });

  it('sends a report and updates the count and the gone state from the answer', async () => {
    const api = mockApi({
      'GET /api/me': SIGNED_IN,
      [`GET ${PATH}`]: detail(),
      [`POST ${PATH}/reports`]: () => ({
        status: 201,
        body: {
          reportCounts: {
            food_gone: 3,
            still_food: 1,
            not_free: 0,
            wrong_info: 0,
            wrong_audience: 0,
          },
          lastReportAt: new Date().toISOString(),
          likelyGone: true,
        },
      }),
    });
    const { user } = renderDetails();
    expect(screen.queryByText('Likely over')).toBeNull();

    await user.click(await screen.findByRole('button', { name: "Food's gone, 2 reports" }));

    const pressed = await screen.findByRole('button', { name: "Food's gone, 3 reports" });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(api.bodiesFor(`POST ${PATH}/reports`)).toEqual([{ kind: 'food_gone' }]);
    expect(await screen.findByText('Thanks, your report was counted.')).toBeTruthy();
    expect(screen.getByText('Likely over')).toBeTruthy();
    expect(await paragraph('Last report just now')).toBeTruthy();
    expect(screen.getByText('3 people reported the food is gone.')).toBeTruthy();
  });

  it('asks a signed-out visitor to sign in and keeps the buttons disabled', async () => {
    mockApi({ 'GET /api/me': SIGNED_OUT, [`GET ${PATH}`]: detail() });
    renderDetails();

    const button = await screen.findByRole('button', { name: "Food's gone, 2 reports" });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when the server is rate limiting', async () => {
    mockApi({
      'GET /api/me': SIGNED_IN,
      [`GET ${PATH}`]: detail(),
      [`POST ${PATH}/reports`]: () => apiError(429, 'rate_limited', 'Too many requests.'),
    });
    const { user } = renderDetails();

    await user.click(await screen.findByRole('button', { name: 'Wrong info, 0 reports' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/reporting too fast/);
    expect(screen.queryByText('Thanks, your report was counted.')).toBeNull();
  });
});

describe('crowd signals', () => {
  it('says how recent the last report is, and nothing when there are none', async () => {
    const eightMinutesAgo = new Date(Date.now() - 8 * 60_000 - 5_000).toISOString();
    mockApi({
      'GET /api/me': SIGNED_IN,
      [`GET ${PATH}`]: detail({ lastReportAt: eightMinutesAgo }),
    });
    const first = renderDetails();
    expect(await paragraph('Last report 8 min ago')).toBeTruthy();
    first.unmount();

    mockApi({ 'GET /api/me': SIGNED_IN, [`GET ${PATH}`]: detail({ lastReportAt: null }) });
    renderDetails();
    await screen.findByRole('button', { name: "Food's gone, 2 reports" });
    expect(screen.queryByText(/Last report/)).toBeNull();
  });

  it('counts the report at once, before the server answers', async () => {
    let answer: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      answer = resolve;
    });
    mockApi({ 'GET /api/me': SIGNED_IN, [`GET ${PATH}`]: detail() });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return original(input, init);
      await pending;
      return Response.json(
        {
          reportCounts: {
            food_gone: 2,
            still_food: 2,
            not_free: 0,
            wrong_info: 0,
            wrong_audience: 0,
          },
          lastReportAt: new Date().toISOString(),
          likelyGone: false,
        },
        { status: 201 },
      );
    });
    const { user } = renderDetails();

    await user.click(await screen.findByRole('button', { name: 'Still food, 1 report' }));
    // The request is still in flight, and the count already reads 2.
    expect(await screen.findByRole('button', { name: 'Still food, 2 reports' })).toBeTruthy();
    expect(screen.queryByText('Thanks, your report was counted.')).toBeNull();

    answer?.();
    expect(await screen.findByText('Thanks, your report was counted.')).toBeTruthy();
  });

  it('puts the count back when the report fails', async () => {
    mockApi({
      'GET /api/me': SIGNED_IN,
      [`GET ${PATH}`]: detail(),
      [`POST ${PATH}/reports`]: () => apiError(500, 'internal_error', 'boom'),
    });
    const { user } = renderDetails();

    await user.click(await screen.findByRole('button', { name: 'Still food, 1 report' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't send your report/);
    const button = screen.getByRole('button', { name: 'Still food, 1 report' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
