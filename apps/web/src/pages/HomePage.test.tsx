import type { FoodEvent } from '@maize-bites/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventMapProps } from '../components/EventMap';
import { expectAccessible } from '../test/axe';
import { WAKING_RETRIES, shouldRetry } from '../api/queries';
import { SIGNED_OUT, apiError, mockApi, renderApp } from '../test/api-mock';
import { HEALTH, eventAt, eventId, makeDetail } from '../test/fixtures';
import { setMediaQueries } from '../test/setup';
import { HomePage } from './HomePage';

// MapLibre needs WebGL, which jsdom lacks. This stand-in shows what the map was told (which
// event is hovered and focused) and offers one "pin" per event, so the list↔map wiring is
// tested without a real map.
vi.mock('../components/EventMap', () => ({
  default: ({
    events,
    hoveredId,
    focusedId,
    onFocus,
    onHover,
    onOpen,
    onSearchArea,
    peek,
  }: EventMapProps) => (
    <div
      data-testid="map"
      data-hovered={hoveredId ?? ''}
      data-focused={focusedId ?? ''}
      data-peek={String(peek ?? true)}
    >
      <button
        type="button"
        onClick={() => onSearchArea?.({ west: -84, south: 42, east: -83, north: 43 })}
      >
        search this area
      </button>
      <button
        type="button"
        onClick={() => onSearchArea?.({ west: 0, south: 0, east: 1, north: 1 })}
      >
        search an empty area
      </button>
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
  describe('headline', () => {
    const headline = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });

    // The headline is computed from the list on screen, so the two can never disagree.
    it.each([
      ['/', '1 spot with free food right now'],
      ['/?tab=today', '3 spots today'],
      ['/?tab=week', '3 spots this week'],
    ])('at %s reads "%s"', async (url, text) => {
      api();
      renderApp(<HomePage />, url);
      expect(await headline(text)).toBeTruthy();
    });

    it('follows search and filters', async () => {
      api();
      const { user } = renderApp(<HomePage />, '/?tab=week');
      await cardFor('Leftover pizza');
      await user.type(screen.getByRole('searchbox'), 'ramen');
      expect(await headline('1 spot this week')).toBeTruthy();
    });

    it('with nothing live, links to what is next', async () => {
      api([soon, nextWeek]);
      renderApp(<HomePage />, '/');
      const next = await screen.findByRole('link', {
        name: /^Bagels at Michigan Union in \d+ min$/,
      });
      expect(next.getAttribute('href')).toBe(`/?event=${soon.id}`);
      expect(next.closest('h1')?.textContent).toMatch(/^Nothing right now — next up: Bagels/);
    });
  });

  describe('freshness', () => {
    const dot = () => document.querySelector('[data-freshness]')?.getAttribute('data-freshness');
    const healthAt = (minutesAgo: number) => ({
      ...HEALTH,
      lastSuccessfulIngestionAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    });
    const withHealth = (minutesAgo: number) =>
      mockApi({
        'GET /api/me': SIGNED_OUT,
        'GET /api/health': healthAt(minutesAgo),
        'GET /api/events/now': { events: [live], nextCursor: null },
      });

    it('is green only when the data is minutes old', async () => {
      withHealth(4);
      renderApp(<HomePage />);
      expect(await screen.findByText(/^Updated/)).toBeTruthy();
      expect(dot()).toBe('fresh');
    });

    it('is amber, not green, at an hour and a quarter', async () => {
      withHealth(74);
      renderApp(<HomePage />);
      expect((await screen.findByText(/^Updated/)).textContent).toBe('Updated 1 hr 14 min ago');
      expect(dot()).toBe('aging');
    });

    it('is grey beyond two hours', async () => {
      withHealth(200);
      renderApp(<HomePage />);
      await screen.findByText(/^Updated/);
      expect(dot()).toBe('old');
    });
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

  it('shows each event’s time once', async () => {
    api();
    renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza');
    for (const card of screen.getAllByRole('article')) {
      expect(card.querySelectorAll('time')).toHaveLength(1);
    }
  });

  it('offers "Search this area" results as a removable chip', async () => {
    api();
    const { user } = renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza');
    // The stand-in map searches an area that holds only the Duderstadt Center.
    await user.click(screen.getByRole('button', { name: 'search this area' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'search an empty area' }));
    expect(await screen.findByText('Nothing in this part of the map.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show everywhere' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'search this area' }));
    await user.click(screen.getByRole('button', { name: 'Remove filter: Map area' }));
    expect(screen.queryByRole('button', { name: 'Remove filter: Map area' })).toBeNull();
  });

  it('badges only the exceptions', async () => {
    api();
    renderApp(<HomePage />, '/?tab=week');
    expect((await cardFor('Leftover pizza')).textContent).not.toMatch(/Open to all|Members|RSVP/);
    expect((await cardFor('Bagel break')).textContent).toContain('Members only');
    expect((await cardFor('Ramen night')).textContent).toContain('RSVP required');
    // "Open to all" exists once, as the filter switch: on no card, and with no chip even when on.
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
      // The peek card would sit under the drawer, so it is put away while the details are open.
      expect(map().dataset['peek']).toBe('false');
    });

    it('washes the row in colour for a moment after its pin is picked', async () => {
      api();
      const { user } = renderApp(<HomePage />, '/?tab=week');
      await cardFor('Ramen night');
      await user.click(screen.getByRole('button', { name: 'pin: Ramen night' }));
      expect((await cardFor('Ramen night')).className).toContain('animate-flash');
      await waitFor(
        () => {
          expect(screen.getByRole('article', { name: 'Ramen night' }).className).not.toContain(
            'animate-flash',
          );
        },
        { timeout: 2500 },
      );
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
    expect(within(map()).getAllByRole('button', { name: /^pin:/ })).toHaveLength(1);

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

  describe('when the API is waking from sleep', () => {
    /** Answers 503 (as a proxy does for a sleeping host) `failures` times, then normally. */
    function sleepyApi(failures: number) {
      let calls = 0;
      mockApi({
        'GET /api/me': SIGNED_OUT,
        'GET /api/health': HEALTH,
        'GET /api/events/now': () =>
          calls++ < failures
            ? apiError(503, 'service_unavailable', 'Service unavailable')
            : { body: { events: [live], nextCursor: null } },
      });
      return () => calls;
    }
    const production = { retry: shouldRetry, retryDelay: () => 20 };

    it('says so and keeps trying, then shows the list with no error in between', async () => {
      const calls = sleepyApi(3);
      renderApp(<HomePage />, '/', production);

      expect(
        (await screen.findByText('Waking up the server.')).closest('[role="status"]'),
      ).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();

      expect(await cardFor('Leftover pizza')).toBeTruthy();
      expect(calls()).toBe(4);
      expect(screen.queryByText('Waking up the server.')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('gives up with a retry button if the API never comes back', async () => {
      const calls = sleepyApi(Infinity);
      const { user } = renderApp(<HomePage />, '/', production);

      expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent).toContain(
        "Couldn't load events",
      );
      expect(calls()).toBe(WAKING_RETRIES + 1);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(calls()).toBeGreaterThan(WAKING_RETRIES + 1);
    });

    it('does not mention waking on an ordinary quick load', async () => {
      api();
      renderApp(<HomePage />, '/', production);
      await cardFor('Leftover pizza');
      expect(screen.queryByText('Waking up the server.')).toBeNull();
    });
  });

  it('has an empty state with a next step when nothing is on', async () => {
    api([]);
    renderApp(<HomePage />);
    expect(await screen.findByText('Quiet right now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See today' }).getAttribute('href')).toBe(
      '/?tab=today',
    );
    expect(screen.getByRole('link', { name: 'Get alerts' }).getAttribute('href')).toBe('/alerts');
  });

  it('offers to clear filters when they are why the list is empty', async () => {
    api([]);
    const { user } = renderApp(<HomePage />, '/?tab=week&diet=kosher');
    expect(await screen.findByText('Nothing matches those filters.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Nothing this week yet.')).toBeTruthy();
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
    expect(screen.getByRole('status').textContent).toMatch(/^Offline — showing data from \d+:\d\d/);
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
    expect(await within(filters).findByRole('button', { name: 'Show 3 spots' })).toBeTruthy();
  });

  it('on a phone, keeps search behind a button until it is wanted', async () => {
    setMediaQueries(() => false);
    api();
    const { user } = renderApp(<HomePage />, '/?tab=week');
    await cardFor('Leftover pizza');
    expect(screen.queryByRole('searchbox')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const box = screen.getByRole('searchbox', { name: 'Search events' });
    expect(document.activeElement).toBe(box);
    await user.type(box, 'ramen');
    expect(screen.getAllByRole('article')).toHaveLength(1);
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
