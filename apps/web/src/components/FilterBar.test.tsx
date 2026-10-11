import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useHomeParams } from '../hooks/useHomeParams';
import { expectAccessible } from '../test/axe';
import { FilterBar } from './FilterBar';

/** FilterBar wired to the URL exactly as the Home page does, plus a readout of the query string. */
function Harness() {
  const { filters, setFilters, tab, setTab, search, setSearch } = useHomeParams();
  const location = useLocation();
  return (
    <>
      <FilterBar
        tab={tab}
        onTab={setTab}
        filters={filters}
        onChange={setFilters}
        search={search}
        onSearch={setSearch}
      />
      <output data-testid="search">{location.search}</output>
    </>
  );
}

function renderAt(url = '/') {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <Harness />
    </MemoryRouter>,
  );
  return { user, search: () => screen.getByTestId('search').textContent, ...view };
}

const pill = (name: RegExp) => screen.getByRole('button', { name });
const option = (name: string) => screen.getByRole('menuitemcheckbox', { name });
const activeChips = () =>
  within(screen.getByRole('list', { name: 'Active filters' }))
    .getAllByRole('button')
    .map((b) => b.textContent);

describe('FilterBar', () => {
  it('is one row: when, three pill menus, the open-to-all switch, and search', () => {
    renderAt();
    expect(
      within(screen.getByRole('radiogroup', { name: 'When' }))
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Now', 'Today', 'This Week']);
    expect(pill(/^Campus/)).toBeTruthy();
    expect(pill(/^Diet/)).toBeTruthy();
    expect(pill(/^Meal/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Open to all' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search events' })).toBeTruthy();
    // Nothing is active, so there is no second row and no Clear.
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('lists every option in each menu', async () => {
    const { user } = renderAt();
    await user.click(pill(/^Campus/));
    expect(screen.getAllByRole('menuitemcheckbox').map((o) => o.textContent)).toEqual([
      'Central',
      'North',
      'Medical',
      'Athletic',
    ]);
    await user.keyboard('{Escape}');
    await user.click(pill(/^Diet/));
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(7);
  });

  it('ticks several campuses in one visit, counts them on the pill, and writes the URL', async () => {
    const { user, search } = renderAt('/?tab=today');
    await user.click(pill(/^Campus/));
    await user.click(option('North'));
    await user.click(option('Central'));

    expect(option('North').getAttribute('aria-checked')).toBe('true');
    // Canonical order, whatever order they were picked in; other params are kept.
    expect(search()).toBe('?tab=today&campus=central%2Cnorth');
    await user.keyboard('{Escape}');
    expect(pill(/^Campus/).textContent).toBe('Campus· 2 selected');
    expect(activeChips()).toEqual(['Central Campus', 'North Campus']);
  });

  it('removes one filter from its chip', async () => {
    const { user, search } = renderAt('/?campus=central,north&diet=vegan');
    expect(activeChips()).toEqual(['Central Campus', 'North Campus', 'Vegan']);

    await user.click(screen.getByRole('button', { name: 'Remove filter: North Campus' }));
    expect(search()).toBe('?campus=central&diet=vegan');
    expect(activeChips()).toEqual(['Central Campus', 'Vegan']);
  });

  it('meal is a single choice shown on the pill, and picking it again clears it', async () => {
    const { user, search } = renderAt();
    await user.click(pill(/^Meal/));
    await user.click(option('Lunch'));
    expect(search()).toBe('?meal=lunch');
    expect(pill(/^Lunch/)).toBeTruthy();

    await user.click(pill(/^Lunch/));
    await user.click(option('Dinner'));
    expect(search()).toBe('?meal=dinner');

    await user.click(pill(/^Dinner/));
    await user.click(option('Dinner'));
    expect(search()).toBe('');
  });

  it('shows no chip row when the only filter is the open-to-all switch', () => {
    renderAt('/?open=1');
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull();
    // It still counts as a filter: Clear is offered.
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('never colours a control maize: active controls are ink', () => {
    const { container } = renderAt('/?tab=week&campus=north&open=1');
    expect(container.innerHTML).not.toMatch(/\b(bg|border|text)-maize\b/);
  });

  it('toggles open-to-all with the switch', async () => {
    const { user, search } = renderAt();
    const toggle = screen.getByRole('switch', { name: 'Open to all' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await user.click(toggle);
    expect(search()).toBe('?open=1');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);
    expect(search()).toBe('');
  });

  it('restores state from the URL and ignores unknown values', () => {
    renderAt('/?campus=north,mars&diet=vegan,halal&meal=brunch&open=1&q=pizza');
    // Dropdown choices get chips. "Open to all" does not: its switch already shows it is on.
    expect(activeChips()).toEqual(['North Campus', 'Vegan', 'Halal']);
    expect(screen.getByRole('switch', { name: 'Open to all' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getAllByText('Open to all')).toHaveLength(1);
    expect(pill(/^Diet/).textContent).toBe('Diet· 2 selected');
    expect(pill(/^Meal/)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('pizza');
  });

  it('Clear removes every filter but keeps the tab and the search', async () => {
    const { user, search } = renderAt('/?tab=week&campus=north&open=1&q=pizza');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(search()).toBe('?tab=week&q=pizza');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('switches the time window', async () => {
    const { user, search } = renderAt();
    await user.click(screen.getByRole('radio', { name: 'This Week' }));
    expect(search()).toBe('?tab=week');
    expect(screen.getByRole('radio', { name: 'This Week' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await user.click(screen.getByRole('radio', { name: 'Now' }));
    expect(search()).toBe('');
  });

  it('writes the search to the URL and clears it with the button or Escape', async () => {
    const { user, search } = renderAt();
    const box = screen.getByRole('searchbox');
    await user.type(box, 'ramen');
    expect(search()).toBe('?q=ramen');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search()).toBe('');
    await user.type(box, 'union{Escape}');
    expect(search()).toBe('');
  });

  it('is operable from the keyboard alone', async () => {
    const { user, search } = renderAt();
    pill(/^Diet/).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(search()).toMatch(/diet=/);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(pill(/^Diet/));
  });

  it('has no accessibility violations, closed or with a menu open', async () => {
    const { user, container } = renderAt('/?campus=north&open=1');
    await expectAccessible(container);
    await user.click(pill(/^Diet/));
    await expectAccessible(document.body);
  });
});
