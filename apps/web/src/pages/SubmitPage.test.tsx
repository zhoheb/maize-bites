import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILDINGS, SIGNED_IN, SIGNED_OUT, apiError, mockApi, renderApp } from '../test/api-mock';
import { SubmitPage } from './SubmitPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const TIP_ID = '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11';
const EVENT_ID = '7a2d2c8f-9e9b-4a4f-8e72-3c4d7a1f0b22';

async function fillAndSubmit(user: ReturnType<typeof renderApp>['user']) {
  await user.type(await screen.findByLabelText('What is it?'), 'Leftover pizza');
  await user.type(screen.getByRole('combobox', { name: 'Building' }), 'dude');
  await user.click(await screen.findByRole('option', { name: /Duderstadt Center/ }));
  await user.type(screen.getByLabelText(/Room or spot/), 'Atrium');
  await user.click(screen.getByRole('button', { name: 'Share it' }));
}

describe('SubmitPage', () => {
  it('asks a signed-out visitor to sign in', async () => {
    mockApi({ 'GET /api/me': SIGNED_OUT });
    renderApp(<SubmitPage />);

    expect(await screen.findByText('Sign in to share free food')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
    expect(screen.queryByRole('button', { name: 'Share it' })).toBeNull();
  });

  it('sends a tip with the picked building and tells a new user it will be reviewed', async () => {
    const api = mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/buildings': BUILDINGS,
      'POST /api/submissions': () => ({
        status: 201,
        body: { id: TIP_ID, status: 'pending', eventId: null },
      }),
    });
    const { user } = renderApp(<SubmitPage />);

    await fillAndSubmit(user);

    expect(await screen.findByRole('heading', { name: 'Thanks for the tip' })).toBeTruthy();
    expect(screen.getByText(/A moderator will look at it/)).toBeTruthy();
    const [body] = api.bodiesFor('POST /api/submissions');
    expect(body).toMatchObject({
      title: 'Leftover pizza',
      buildingId: '0b0e8f3a-2c1d-4e5f-8a9b-1c2d3e4f5a6b',
      room: 'Atrium',
      description: null,
      endsAt: null,
    });
    expect((body as { startsAt: string }).startsAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/,
    );
  });

  it('links to the live event when a trusted user’s tip publishes at once', async () => {
    mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/buildings': BUILDINGS,
      'POST /api/submissions': () => ({
        status: 201,
        body: { id: TIP_ID, status: 'approved', eventId: EVENT_ID },
      }),
    });
    const { user } = renderApp(<SubmitPage />);

    await fillAndSubmit(user);

    expect(await screen.findByRole('heading', { name: 'Your tip is live' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See it' }).getAttribute('href')).toBe(
      `/events/${EVENT_ID}`,
    );
  });

  it('shows field errors and sends nothing when the form is incomplete', async () => {
    const api = mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/buildings': BUILDINGS });
    const { user } = renderApp(<SubmitPage />);

    await user.type(await screen.findByLabelText('What is it?'), 'x');
    // Typed, but never picked from the list.
    await user.type(screen.getByRole('combobox', { name: 'Building' }), 'somewhere');
    await user.click(screen.getByRole('button', { name: 'Share it' }));

    const alerts = (await screen.findAllByRole('alert')).map((a) => a.textContent);
    expect(alerts).toEqual(['Add a short title', 'Pick a building from the list']);
    expect(screen.getByLabelText('What is it?').getAttribute('aria-invalid')).toBe('true');
    expect(api.bodiesFor('POST /api/submissions')).toEqual([]);
  });

  it("shows the server's reason when it rejects the tip", async () => {
    mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/buildings': BUILDINGS,
      'POST /api/submissions': () =>
        apiError(400, 'invalid_request', 'This event has already ended'),
    });
    const { user } = renderApp(<SubmitPage />);

    await fillAndSubmit(user);

    expect((await screen.findByRole('alert')).textContent).toBe('This event has already ended');
    expect(screen.getByRole('button', { name: 'Share it' })).toBeTruthy();
  });

  it('lets the keyboard pick a building', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/buildings': BUILDINGS });
    const { user } = renderApp(<SubmitPage />);
    const combobox = await screen.findByRole('combobox', { name: 'Building' });
    await waitFor(() => {
      expect(screen.queryByText("Couldn't load the building list.")).toBeNull();
    });

    await user.type(combobox, 'mich');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Michigan LeagueCentral',
      'Michigan UnionCentral',
    ]);
    await user.keyboard('{ArrowDown}{Enter}');

    expect((combobox as HTMLInputElement).value).toBe('Michigan Union');
    expect(combobox.getAttribute('aria-expanded')).toBe('false');
  });
});
