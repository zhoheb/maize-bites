import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { expectAccessible } from '../test/axe';
import { makeEvent } from '../test/fixtures';
import { NowCard, type EventCardProps } from './NowCard';

// Fixture: Oct 1 16:00–17:30 UTC (noon–1:30 PM in Ann Arbor), Duderstadt Center room 1180.
const BEFORE = new Date('2026-10-01T15:48:00Z');
const DURING = new Date('2026-10-01T16:30:00Z');
const CLOSING = new Date('2026-10-01T17:20:00Z');

const clean = (s: string | null | undefined) => (s ?? '').replace(/\u202f/g, ' ');

function renderCard(props: Partial<EventCardProps> = {}) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <NowCard
        event={makeEvent({ foodItems: ['pizza', 'wings'] })}
        now={DURING}
        href="/?event=abc"
        {...props}
      />
    </MemoryRouter>,
  );
  return { user, ...view };
}

const card = () => screen.getByRole('article', { name: 'Pizza at the Dude' });
const bar = () => within(card()).queryByRole('progressbar', { name: 'Time elapsed' });

describe('NowCard', () => {
  it('while live: status, time left, title, food, a progress bar, the hours and the place', () => {
    renderCard();

    expect(within(card()).getByText('Happening now')).toBeTruthy();
    expect(within(card()).getByText('ends in 1 hr')).toBeTruthy();
    expect(card().textContent).toContain('Food: Pizza, wings');
    expect(bar()?.getAttribute('aria-valuenow')).toBe('33');
    expect(clean(card().textContent)).toContain('Time: 12:00 – 1:30 PM');
    expect(card().textContent).toContain('Location: Duderstadt Center · 1180');
  });

  it('before the start: counts down, with no progress bar and no "ends in"', () => {
    renderCard({ now: BEFORE });
    expect(within(card()).getByText('Starts in 12 min')).toBeTruthy();
    expect(bar()).toBeNull();
    expect(card().textContent).not.toContain('ends in');
  });

  it('shows the time once: the hours appear in one place only', () => {
    renderCard();
    expect(card().querySelectorAll('time')).toHaveLength(1);
    expect(clean(card().textContent).match(/12:00/g)).toHaveLength(1);
  });

  it('turns the bar amber in the closing stretch', () => {
    renderCard({ now: CLOSING });
    expect(bar()?.firstElementChild?.className).toContain('bg-soon');
    expect(within(card()).getByText('ends in 10 min')).toBeTruthy();
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

    it('shows none for an event open to all, or with no stated audience', () => {
      const { unmount } = renderCard({ event: makeEvent({ audience: 'open' }) });
      expect(badges()).toEqual([]);
      expect(screen.queryByText('Open to all')).toBeNull();
      unmount();
      renderCard({ event: makeEvent({ audience: 'unknown' }) });
      expect(badges()).toEqual([]);
    });

    it('shows Members only and RSVP required', () => {
      const { unmount } = renderCard({ event: makeEvent({ audience: 'members' }) });
      expect(badges()).toEqual(['Members only']);
      unmount();
      renderCard({ event: makeEvent({ audience: 'rsvp' }) });
      expect(badges()).toEqual(['RSVP required']);
    });

    it('shows Likely over and sets the card back without fading it', () => {
      renderCard({ event: makeEvent({ likelyGone: true }) });
      expect(badges()).toEqual(['Likely over']);
      expect(card().dataset['likelyOver']).toBe('true');
      // Greyed with colour, not opacity, so the text keeps its contrast. No live dot either.
      expect(card().className).not.toContain('opacity');
      expect(card().querySelector('.animate-ring')).toBeNull();
      expect(bar()?.firstElementChild?.className).toContain('bg-over');
    });
  });

  describe('food line', () => {
    it('falls back to the meal the classifier named when the listing listed no items', () => {
      renderCard({ event: makeEvent({ foodItems: [], mealType: 'lunch' }) });
      expect(card().textContent).toContain('Food: Lunch');
    });

    it('shows nothing when neither was extracted, whatever the time of day', () => {
      // A noon event with no meal type and no items: nothing is guessed.
      renderCard({ event: makeEvent({ foodItems: [], mealType: null }) });
      expect(card().textContent).not.toContain('Food:');
      expect(card().textContent).not.toMatch(/lunch/i);
    });
  });

  it('lists dietary tags as plain labels, with full names for screen readers', () => {
    renderCard({ event: makeEvent({ dietary: ['vegan', 'gluten_free'] }) });
    const list = screen.getByRole('list', { name: 'Dietary' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((t) => t.textContent),
    ).toEqual(['VeganVegan', 'GFGluten-free']);
    // Information, not controls: nothing in there is a button.
    expect(within(list).queryAllByRole('button')).toEqual([]);
  });

  it('shows the walking distance only when given one', () => {
    const { unmount } = renderCard();
    expect(screen.queryByText(/min walk/)).toBeNull();
    unmount();
    renderCard({ distance: '4 min walk' });
    expect(screen.getByText('4 min walk')).toBeTruthy();
  });

  it('marks the selected, highlighted and flashed states', () => {
    const { unmount } = renderCard({ selected: true });
    expect(within(card()).getByRole('link').getAttribute('aria-current')).toBe('true');
    expect(card().className).toContain('ring-maize');
    unmount();
    renderCard({ highlighted: true, flash: true });
    expect(card().getAttribute('data-highlighted')).toBe('true');
    expect(card().className).toContain('animate-flash');
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
      distance: '4 min walk',
    });
    await expectAccessible(container);
    unmount();
    const plain = renderCard({ event: makeEvent({ foodItems: [], mealType: null }), now: BEFORE });
    await expectAccessible(plain.container);
  });
});
