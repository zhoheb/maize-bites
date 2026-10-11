import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { expectAccessible } from '../test/axe';
import { makeEvent } from '../test/fixtures';
import { EventCard, type EventCardProps } from './EventCard';

// Fixture: Oct 1 16:00–17:30 UTC (noon–1:30 PM in Ann Arbor), Duderstadt Center room 1180.
const MORNING = new Date('2026-10-01T12:00:00Z');
const BEFORE = new Date('2026-10-01T15:35:00Z');
const DURING = new Date('2026-10-01T16:30:00Z');
const NEAR_END = new Date('2026-10-01T17:20:00Z');
const AFTER = new Date('2026-10-01T18:00:00Z');

const clean = (s: string | null | undefined) => (s ?? '').replace(/\u202f/g, ' ');

function renderCard(props: Partial<EventCardProps> = {}) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <EventCard
        event={makeEvent({ foodItems: ['pizza', 'boba'] })}
        now={BEFORE}
        href="/?event=abc"
        {...props}
      />
    </MemoryRouter>,
  );
  return { user, ...view };
}

const card = () => screen.getByRole('article', { name: 'Pizza at the Dude' });

describe('EventCard', () => {
  it('reads when, what, the food, where, and the hours', () => {
    renderCard();

    expect(screen.getByText('Starts in 25 min')).toBeTruthy();
    expect(card().textContent).toContain('Food: Pizza, boba');
    expect(card().textContent).toContain('Duderstadt Center · 1180 · North');
    expect(clean(card().textContent)).toContain('12:00 – 1:30 PM');
    expect(card().querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-01T16:00:00.000Z');
  });

  it.each([
    [MORNING, 'Today 12:00 PM'],
    [BEFORE, 'Starts in 25 min'],
    [DURING, 'Happening now · ends in 1 hr'],
    [NEAR_END, 'Ending soon · 10 min left'],
    [AFTER, 'Ended'],
  ])('at %s the status pill says "%s"', (now, text) => {
    renderCard({ now });
    expect(clean(card().querySelector('time')?.textContent)).toBe(text);
  });

  it('is a single link to the event', () => {
    renderCard();
    const links = within(card()).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('/?event=abc');
  });

  describe('badges', () => {
    const badges = () =>
      within(card())
        .queryAllByRole('listitem')
        .filter((li) => li.closest('[aria-label="Good to know"]'))
        .map((li) => li.textContent);

    it('shows none for an event open to all: the default is not a badge', () => {
      renderCard({ event: makeEvent({ audience: 'open' }) });
      expect(badges()).toEqual([]);
      expect(screen.queryByText('Open to all')).toBeNull();
    });

    it('shows none when the audience is unknown', () => {
      renderCard({ event: makeEvent({ audience: null }) });
      expect(badges()).toEqual([]);
    });

    it('shows Members only and RSVP required', () => {
      const { unmount } = renderCard({ event: makeEvent({ audience: 'members' }) });
      expect(badges()).toEqual(['Members only']);
      unmount();
      renderCard({ event: makeEvent({ audience: 'rsvp' }) });
      expect(badges()).toEqual(['RSVP required']);
    });

    it('shows Likely over, sets the card back, and mutes the pill', () => {
      renderCard({ event: makeEvent({ likelyGone: true }), now: DURING });
      expect(badges()).toEqual(['Likely over']);
      expect(card().dataset['likelyOver']).toBe('true');
      expect(card().className).toContain('bg-sunken');
      // Set back with colour, not opacity, so the text keeps its contrast.
      expect(card().className).not.toContain('opacity');
      // No pulsing dot on a muted pill.
      expect(card().querySelector('.animate-ping')).toBeNull();
    });

    it('is not dimmed otherwise', () => {
      renderCard({ now: DURING });
      expect(card().dataset['likelyOver']).toBeUndefined();
      expect(card().querySelector('.animate-ping')).not.toBeNull();
    });
  });

  describe('food line', () => {
    it('falls back to the meal type when the listing named no items', () => {
      renderCard({ event: makeEvent({ foodItems: [], mealType: 'lunch' }) });
      expect(card().textContent).toContain('Food: Lunch');
    });

    it('shows no meal when the classifier extracted none, whatever the time of day', () => {
      // A noon event with no meal type and no items: nothing is guessed.
      renderCard({ event: makeEvent({ foodItems: [], mealType: null }) });
      expect(card().textContent).not.toContain('Food:');
      expect(card().textContent).not.toMatch(/lunch/i);
    });

    it('shows the items alone when there is no meal type', () => {
      renderCard({ event: makeEvent({ foodItems: ['cookies'], mealType: null }) });
      expect(card().textContent).toContain('Food: Cookies');
      expect(card().textContent).not.toMatch(/lunch|snack/i);
    });
  });

  it('lists dietary tags compactly with full names for screen readers', () => {
    renderCard({ event: makeEvent({ dietary: ['vegan', 'gluten_free'] }) });
    const tags = within(screen.getByRole('list', { name: 'Dietary' })).getAllByRole('listitem');
    expect(tags.map((t) => t.textContent)).toEqual(['VeganVegan', 'GFGluten-free']);
  });

  it('falls back to the raw feed location when no building matched', () => {
    renderCard({ event: makeEvent({ building: null, room: null, locationName: 'The Diag' }) });
    expect(card().textContent).toContain('The Diag');
  });

  it('shows the walking distance only when given one', () => {
    const { unmount } = renderCard();
    expect(screen.queryByText(/min walk/)).toBeNull();
    unmount();
    renderCard({ distance: '4 min walk' });
    expect(screen.getByText('4 min walk')).toBeTruthy();
  });

  it('marks the selected card and the highlighted card', () => {
    const { unmount } = renderCard({ selected: true });
    expect(within(card()).getByRole('link').getAttribute('aria-current')).toBe('true');
    unmount();
    renderCard({ highlighted: true });
    expect(card().getAttribute('data-highlighted')).toBe('true');
  });

  it('reports hover and keyboard focus so the map can highlight its pin', async () => {
    const onHover = vi.fn();
    const { user } = renderCard({ onHover });

    await user.hover(card());
    expect(onHover).toHaveBeenLastCalledWith('6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11');
    await user.unhover(card());
    expect(onHover).toHaveBeenLastCalledWith(null);
    await user.tab();
    expect(onHover).toHaveBeenLastCalledWith('6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11');
  });

  it('has no accessibility violations, in any state', async () => {
    const { container, unmount } = renderCard({
      event: makeEvent({ audience: 'rsvp', dietary: ['vegan', 'halal'], likelyGone: true }),
      now: DURING,
      distance: '4 min walk',
    });
    await expectAccessible(container);
    unmount();
    const plain = renderCard({ event: makeEvent({ foodItems: [], mealType: null }) });
    await expectAccessible(plain.container);
  });
});
