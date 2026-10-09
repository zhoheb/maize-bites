import type { EventDetail } from '@maize-bites/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIGNED_IN, SIGNED_OUT, apiError, mockApi, renderApp } from '../test/api-mock';
import { makeEvent } from '../test/fixtures';
import { EventCard } from './EventCard';
import { EventDetails } from './EventDetails';

afterEach(() => {
  vi.unstubAllGlobals();
});

const event = makeEvent();
const detail = (overrides: Partial<EventDetail> = {}): EventDetail => ({
  ...event,
  classification: null,
  reportCounts: { food_gone: 2, still_food: 1, not_free: 0, wrong_info: 0 },
  ...overrides,
});
const PATH = `/api/events/${event.id}`;
const renderDetails = () => renderApp(<EventDetails id={event.id} titleId="t" />);

describe('report buttons in event details', () => {
  it('shows live counts for each kind of report', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, [`GET ${PATH}`]: detail() });
    renderDetails();

    expect(await screen.findByRole('button', { name: "Food's gone, 2 reports" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Still food, 1 report' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not free, 0 reports' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wrong info, 0 reports' })).toBeTruthy();
  });

  it('sends a report and updates the count and the gone state from the answer', async () => {
    const api = mockApi({
      'GET /api/me': SIGNED_IN,
      [`GET ${PATH}`]: detail(),
      [`POST ${PATH}/reports`]: () => ({
        status: 201,
        body: {
          reportCounts: { food_gone: 3, still_food: 1, not_free: 0, wrong_info: 0 },
          likelyGone: true,
        },
      }),
    });
    const { user } = renderDetails();
    expect(screen.queryByText('Food may be gone')).toBeNull();

    await user.click(await screen.findByRole('button', { name: "Food's gone, 2 reports" }));

    const pressed = await screen.findByRole('button', { name: "Food's gone, 3 reports" });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(api.bodiesFor(`POST ${PATH}/reports`)).toEqual([{ kind: 'food_gone' }]);
    expect(screen.getByText('Thanks, your report was counted.')).toBeTruthy();
    expect(screen.getByText('Food may be gone')).toBeTruthy();
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

describe('an event three people reported gone', () => {
  it('is grayed out on its card, with a badge instead of the audience', () => {
    renderApp(
      <EventCard event={makeEvent({ likelyGone: true })} now={new Date(event.startsAt)} href="/" />,
    );
    const card = screen.getByRole('article', { name: event.title });
    expect(card.className).toContain('grayscale');
    expect(card.className).toContain('opacity-60');
    expect(screen.getByText('Food may be gone')).toBeTruthy();
    expect(screen.queryByText('Open to all')).toBeNull();
  });

  it('is not grayed out otherwise', () => {
    renderApp(<EventCard event={event} now={new Date(event.startsAt)} href="/" />);
    expect(screen.getByRole('article', { name: event.title }).className).not.toContain('grayscale');
    expect(screen.getByText('Open to all')).toBeTruthy();
  });
});
