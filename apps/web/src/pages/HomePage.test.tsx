import type { FoodEvent } from '@maize-bites/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventMapProps } from '../components/EventMap';
import { expectAccessible } from '../test/axe';
import { SIGNED_OUT, mockApi, renderApp } from '../test/api-mock';
import { HEALTH, eventAt, eventId, makeDetail } from '../test/fixtures';
import { setMediaQueries } from '../test/setup';
import { HomePage } from './HomePage';

// MapLibre needs WebGL, which jsdom lacks. This stand-in shows what the map was told (which
// event is hovered and focused) and offers one "pin" per event, so the list↔map wiring is
// tested without a real map.
vi.mock('../components/EventMap', () => ({
  default: ({ events, hoveredId, focusedId, onFocus, onHover, onOpen }: EventMapProps) => (
    <div data-testid="map" data-hovered={hoveredId ?? ''} data-focused={focusedId ?? ''}>
      {events.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => {
            onFocus(e.id);
          }}
          onMouseEnter={() => {
            onHover(e.id);
          }}
          onMouseLeave={() => {
            onHover(null);
          }}
        >
          pin: {e.title}
        </button>
      ))}
      {focusedId && (
        <button
          type="button"
          onClick={() => {
            onOpen(focusedId);
          }}
        >
          popover details
        </button>
      )}
    </div>
  ),
}));

const NOW = new Date();
const HOUR = 60;
const DAY = 24 * HOUR;

const live = eventAt(NOW, -20, 60, {
  id: eventId(1),
  title: 'Leftover pizza',
  foodItems: ['pizza'],
});
const soon = eventAt(NOW, 40, 60, {
  id: eventId(2),
  title: 'Bagel break',
  foodItems: ['bagels', 'coffee'],
  audience: 'members',
  building: { id: eventId(91), name: 'Michigan Union', campus: 'central' },
});
const nextWeek = eventAt(NOW, 3 * DAY, 60, {
  id: eventId(3),
  title: 'Ramen night',
  foodItems: ['ramen'],
  audience: 'rsvp',
});
const EVENTS = [live, soon, nextWeek];

function api(events: FoodEvent[] = EVENTS) {
  return mockApi({
    'GET /api/me': SIGNED_OUT,
    'GET /api/health': HEALTH,
    'GET /api/events': { events, nextCursor: null },
    'GET /api/events/now': { events: events.filter((e) => e !== nextWeek), nextCursor: null },
    [`GET /api/events/${live.id}`]: makeDetail({ ...live }),
  });
}

const desktop = () => {
  setMediaQueries((query) => query === '(min-width: 1024px)');
};
const cardFor = (title: string) => screen.findByRole('article', { name: title });
const map = () => screen.getByTestId('map');

beforeEach(() => {
  localStorage.clear();
  desktop();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('leads with how much free food is live right now', async () => {
    api();
    renderApp(<HomePage />, '/?tab=week');
    expect(
      await screen.findByRole('heading', { level: 1, name: '1 spot with free food right now' }),
    ).toBeTruthy();
  });

  it('groups the list by urgency under headings', async () => {
    api();
    renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza');

    const groups = screen
      .getAllByRole('region')
      .filter((region) => region.getAttribute('aria-labelledby')?.startsWith('group-'))
      .map((region) => [
        region.querySelector('h2 span:not([aria-hidden])')?.textContent,
        within(region)
          .getAllByRole('article')
          .map((a) => a.querySelector('h3')?.textContent),
      ]);
    expect(groups[0]).toEqual(['Happening now', ['Leftover pizza']]);
    expect(groups[1]).toEqual(['Starting soon', ['Bagel break']]);
    expect(groups).toHaveLength(3);
    expect(groups[2]?.[1]).toEqual(['Ramen night']);
  });

  it('badges only the exceptions', async () => {
    api();
    renderApp(<HomePage />, '/?tab=week');
    expect((await cardFor('Leftover pizza')).textContent).not.toMatch(/Open to all|Members|RSVP/);
    expect((await cardFor('Bagel break')).textContent).toContain('Members only');
    expect((await cardFor('Ramen night')).textContent).toContain('RSVP required');
    // "Open to all" exists once, as the filter switch, and on no card.
    expect(screen.getAllByText('Open to all')).toHaveLength(1);
  });

  describe('list and map are one interface', () => {
    it('hovering a card tells the map which pin to highlight', async () => {
      api();
      const { user } = renderApp(<HomePage />, '/?tab=week');
      await user.hover(await cardFor('Bagel break'));
      expect(map().dataset['hovered']).toBe(soon.id);
      await user.unhover(await cardFor('Bagel break'));
      expect(map().dataset['hovered']).toBe('');
    });

    it('hovering a pin highlights its card', async () => {
      api();
      const { user } = renderApp(<HomePage />, '/?tab=week');
      await cardFor('Ramen night');
      await user.hover(screen.getByRole('button', { name: 'pin: Ramen night' }));
      expect((await cardFor('Ramen night')).dataset['highlighted']).toBe('true');
      expect((await cardFor('Bagel break')).dataset['highlighted']).toBeUndefined();
    });

    it('selecting a pin scrolls to and highlights its card, without opening the details', async () => {
      api();
      const scrolled: string[] = [];
      Element.prototype.scrollIntoView = function (this: Element) {
        scrolled.push(this.getAttribute('data-event-id') ?? '');
      };
      const { user } = renderApp(<HomePage />, '/?tab=week');
      await cardFor('Ramen night');

      await user.click(screen.getByRole('button', { name: 'pin: Ramen night' }));
      await user.unhover(screen.getByRole('button', { name: 'pin: Ramen night' }));

      expect(map().dataset['focused']).toBe(nextWeek.id);
      expect((await cardFor('Ramen night')).dataset['highlighted']).toBe('true');
      expect(scrolled).toContain(nextWeek.id);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opening a card opens its details and points the map at its pin', async () => {
      api();
      const { user } = renderApp(<HomePage />, '/?tab=week');
      await user.click(within(await cardFor('Leftover pizza')).getByRole('link'));

      const dialog = await screen.findByRole('dialog', { name: 'Event details' });
      expect(await within(dialog).findByRole('heading', { name: 'Leftover pizza' })).toBeTruthy();
      expect(map().dataset['focused']).toBe(live.id);
    });

    it('the pin popover opens the details', async () => {
      api();
      const { user } = renderApp(<HomePage />, '/?tab=week');
      await cardFor('Leftover pizza');
      await user.click(screen.getByRole('button', { name: 'pin: Leftover pizza' }));
      await user.click(screen.getByRole('button', { name: 'popover details' }));
      expect(await screen.findByRole('dialog', { name: 'Event details' })).toBeTruthy();
    });
  });

  it('searches the loaded events by title, food and building', async () => {
    api();
    const { user } = renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza');
    const box = screen.getByRole('searchbox', { name: 'Search events' });

    await user.type(box, 'ramen');
    expect(screen.getAllByRole('article').map((a) => a.querySelector('h3')?.textContent)).toEqual([
      'Ramen night',
    ]);
    // The map shows the same narrowed set.
    expect(within(map()).getAllByRole('button')).toHaveLength(1);

    await user.clear(box);
    await user.type(box, 'union');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Bagel break' })).toBeTruthy();

    await user.clear(box);
    await user.type(box, 'sushi');
    expect(screen.getByText('Nothing matches “sushi”.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show all events' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('moves through cards with j and k, and focuses search with /', async () => {
    api();
    const { user } = renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza');

    await user.keyboard('j');
    expect(document.activeElement?.textContent).toBe('Leftover pizza');
    expect(map().dataset['focused']).toBe(live.id);
    await user.keyboard('j');
    expect(document.activeElement?.textContent).toBe('Bagel break');
    await user.keyboard('k');
    expect(document.activeElement?.textContent).toBe('Leftover pizza');
    await user.keyboard('k'); // already at the top
    expect(document.activeElement?.textContent).toBe('Leftover pizza');

    await user.keyboard('/');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    // Typing j in the search box types; it doesn't move the selection.
    await user.keyboard('j');
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('j');
  });

  it('Enter on the focused card opens it, and Escape closes the details', async () => {
    api();
    const { user } = renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza');
    await user.keyboard('j{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Event details' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows skeleton cards while loading, with no spinner', () => {
    mockApi({ 'GET /api/me': SIGNED_OUT });
    vi.stubGlobal('fetch', () => new Promise(() => undefined)); // never answers
    renderApp(<HomePage />);
    expect(screen.getByRole('status').textContent).toContain('Loading events');
    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(5);
  });

  it('has an empty state with a next step when nothing is on', async () => {
    api([]);
    renderApp(<HomePage />);
    expect(await screen.findByText('No free food right now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See later today' }).getAttribute('href')).toBe(
      '/?tab=today',
    );
    expect(screen.getByRole('link', { name: 'Get alerts' }).getAttribute('href')).toBe('/alerts');
  });

  it('offers to clear filters when they are why the list is empty', async () => {
    api([]);
    const { user } = renderApp(<HomePage />, '/?tab=week&diet=kosher');
    expect(await screen.findByText('Nothing matches those filters.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('No free food found this week yet.')).toBeTruthy();
  });

  it('shows an error with a retry that works', async () => {
    let fail = true;
    mockApi({
      'GET /api/me': SIGNED_OUT,
      'GET /api/health': HEALTH,
      'GET /api/events/now': () =>
        fail
          ? {
              status: 500,
              body: { error: { code: 'internal_error', message: 'x', requestId: 'r' } },
            }
          : { body: { events: [live], nextCursor: null } },
    });
    const { user } = renderApp(<HomePage />);
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't load events");

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await cardFor('Leftover pizza')).toBeTruthy();
  });

  it('shows the list saved on this device, under a banner, when the request fails', async () => {
    api();
    const first = renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza'); // loads, and saves the list
    await waitFor(() => {
      expect(localStorage.getItem('mb-last-lists')).toContain('Ramen night');
    });
    first.unmount();

    mockApi({ 'GET /api/me': SIGNED_OUT }); // every other request now fails
    renderApp(<HomePage />, '/?tab=week');
    expect(await cardFor('Ramen night')).toBeTruthy();
    expect(screen.getByText("You're offline.")).toBeTruthy();
  });

  it('on a phone, puts the list in a sheet over the map with a filter button', async () => {
    setMediaQueries(() => false);
    api();
    const { user } = renderApp(<HomePage />, '/?tab=week&campus=north');
    await cardFor('Leftover pizza');

    const sheet = screen.getByRole('region', { name: 'Event list' });
    expect(within(sheet).getByRole('article', { name: 'Leftover pizza' })).toBeTruthy();
    // The sheet is not modal: the map and the controls stay reachable.
    expect(screen.getByRole('radiogroup', { name: 'When' })).toBeTruthy();

    // The handle is a button that steps through the three heights.
    const handle = screen.getByRole('button', { name: 'Resize event list. Now small.' });
    await user.click(handle);
    expect(handle.getAttribute('aria-label')).toBe('Resize event list. Now half height.');
    handle.focus();
    await user.keyboard('{ArrowUp}');
    expect(handle.getAttribute('aria-label')).toBe('Resize event list. Now full height.');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(handle.getAttribute('aria-label')).toBe('Resize event list. Now small.');
    expect(map()).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Filters, 1 active' }));
    const filters = await screen.findByRole('dialog', { name: 'Filters' });
    expect(
      within(filters).getByRole('button', { name: 'North' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(await within(filters).findByRole('button', { name: 'Show 3 events' })).toBeTruthy();
  });

  it('on a phone, the list view is a plain list with no map', async () => {
    setMediaQueries(() => false);
    api();
    renderApp(<HomePage />, '/?tab=week&view=list');
    await cardFor('Leftover pizza');
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show on the map' })).toBeTruthy();
  });

  it('has no accessibility violations: list, filters, and with the details open', async () => {
    api();
    const { user } = renderApp(<HomePage />, '/?tab=week&campus=north');
    await cardFor('Leftover pizza');
    await expectAccessible(document.body);

    await user.click(within(await cardFor('Leftover pizza')).getByRole('link'));
    const dialog = await screen.findByRole('dialog', { name: 'Event details' });
    await within(dialog).findByRole('heading', { name: 'Leftover pizza' });
    await expectAccessible(dialog);
  });
});
