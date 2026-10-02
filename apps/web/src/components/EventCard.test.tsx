import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../test/fixtures';
import { EventCard, type EventCardProps } from './EventCard';

// Fixture: Oct 1 16:00–17:30 UTC (noon–1:30 PM in Ann Arbor), Duderstadt Center room 1180.
const BEFORE = new Date('2026-10-01T15:35:00Z');
const DURING = new Date('2026-10-01T16:30:00Z');
const AFTER = new Date('2026-10-01T18:00:00Z');

const normalize = (s: string | null) => (s ?? '').replace(/\u202f/g, ' ');

function renderCard(props: Partial<EventCardProps> = {}) {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <EventCard
        event={makeEvent({ foodItems: ['pizza', 'boba'] })}
        now={BEFORE}
        href="/?event=abc"
        {...props}
      />
    </MemoryRouter>,
  );
  return { user };
}

describe('EventCard', () => {
  it('shows title, food, time, countdown, and building', () => {
    renderCard();

    const card = screen.getByRole('article', { name: 'Pizza at the Dude' });
    expect(card.textContent).toContain('pizza, boba');
    expect(card.textContent).toContain('Duderstadt Center · 1180');
    expect(screen.getByText('Starts in 25 min')).toBeTruthy();
    const time = card.querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe('2026-10-01T16:00:00.000Z');
    expect(normalize(time?.textContent ?? null)).toBe('Thu, Oct 1 · 12:00 PM – 1:30 PM');
  });

  it.each([
    [DURING, 'Ends in 1 hr'],
    [AFTER, 'Ended'],
  ])('counts down relative to now (%s)', (now, text) => {
    renderCard({ now });
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('announces live events to screen readers', () => {
    renderCard({ now: DURING });
    expect(screen.getByText('Happening now.', { exact: false })).toBeTruthy();
  });

  it.each([
    ['open', 'Open to all'],
    ['members', 'Members only'],
    ['rsvp', 'RSVP required'],
  ] as const)('shows the %s audience badge', (audience, label) => {
    render(
      <MemoryRouter>
        <EventCard event={makeEvent({ audience })} now={BEFORE} href="/" />
      </MemoryRouter>,
    );
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows no badge when the audience is unknown', () => {
    renderCard({ event: makeEvent({ audience: null }) });
    expect(screen.queryByText(/open to all|members only|rsvp required/i)).toBeNull();
  });

  it('falls back to the raw location when no building matched', () => {
    renderCard({ event: makeEvent({ building: null, room: null, locationName: 'The Arb' }) });
    expect(screen.getByText('The Arb')).toBeTruthy();
  });

  it('is one link to the event (a single tab stop)', async () => {
    const { user } = renderCard();
    const link = screen.getByRole('link', { name: 'Pizza at the Dude' });
    expect(link.getAttribute('href')).toBe('/?event=abc');
    await user.tab();
    expect(document.activeElement).toBe(link);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('marks the selected card', () => {
    renderCard({ selected: true });
    expect(screen.getByRole('link').getAttribute('aria-current')).toBe('true');
  });

  it('reports hover and keyboard focus so the map can highlight the pin', async () => {
    const onHover = vi.fn();
    const { user } = renderCard({ onHover });
    const id = makeEvent().id;

    await user.hover(screen.getByRole('article'));
    expect(onHover).toHaveBeenLastCalledWith(id);
    await user.unhover(screen.getByRole('article'));
    expect(onHover).toHaveBeenLastCalledWith(null);

    await user.tab();
    expect(onHover).toHaveBeenLastCalledWith(id);
  });
});
