import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useHomeParams } from '../hooks/useHomeParams';
import { FilterBar } from './FilterBar';

/** FilterBar wired to the URL exactly as the Home page does, plus a readout of the query string. */
function Harness() {
  const { filters, setFilters } = useHomeParams();
  const location = useLocation();
  return (
    <>
      <FilterBar filters={filters} onChange={setFilters} />
      <output data-testid="search">{location.search}</output>
    </>
  );
}

function renderAt(url = '/') {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[url]}>
      <Harness />
    </MemoryRouter>,
  );
  return { user, search: () => screen.getByTestId('search').textContent };
}

const group = (name: string) => within(screen.getByRole('group', { name }));
const chip = (groupName: string, name: string) => group(groupName).getByRole('button', { name });

describe('FilterBar', () => {
  it('renders every campus, dietary, and meal option as a toggle button', () => {
    renderAt();
    expect(
      group('Campus')
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Central', 'North', 'Medical', 'Athletic']);
    expect(group('Diet').getAllByRole('button')).toHaveLength(7);
    expect(group('Meal').getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Open to all' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('toggles multi-select chips and writes them to the URL', async () => {
    const { user, search } = renderAt();

    await user.click(chip('Campus', 'North'));
    await user.click(chip('Campus', 'Central'));
    await user.click(chip('Diet', 'Vegan'));

    expect(chip('Campus', 'North').getAttribute('aria-pressed')).toBe('true');
    expect(search()).toBe('?campus=central%2Cnorth&diet=vegan');

    await user.click(chip('Campus', 'North'));
    expect(chip('Campus', 'North').getAttribute('aria-pressed')).toBe('false');
    expect(search()).toBe('?campus=central&diet=vegan');
  });

  it('meal type is single-select and toggles off', async () => {
    const { user, search } = renderAt();

    await user.click(chip('Meal', 'Lunch'));
    await user.click(chip('Meal', 'Dinner'));
    expect(search()).toBe('?meal=dinner');
    expect(chip('Meal', 'Lunch').getAttribute('aria-pressed')).toBe('false');

    await user.click(chip('Meal', 'Dinner'));
    expect(search()).toBe('');
  });

  it('toggles open-to-all', async () => {
    const { user, search } = renderAt();
    await user.click(screen.getByRole('button', { name: 'Open to all' }));
    expect(search()).toBe('?open=1');
    expect(screen.getByRole('button', { name: 'Open to all' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('restores state from the URL and keeps unrelated params', async () => {
    const { user, search } = renderAt(
      '/?tab=today&campus=medical&diet=halal,kosher&open=1&meal=snacks',
    );

    expect(chip('Campus', 'Medical').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Diet', 'Halal').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Diet', 'Kosher').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Meal', 'Snacks').getAttribute('aria-pressed')).toBe('true');

    await user.click(chip('Campus', 'Athletic'));
    expect(search()).toBe(
      '?tab=today&campus=medical%2Cathletic&diet=halal%2Ckosher&open=1&meal=snacks',
    );
  });

  it('ignores unknown values in the URL', () => {
    renderAt('/?campus=dearborn&diet=paleo&meal=brunch');
    for (const button of screen.getAllByRole('button'))
      expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('shows "Clear filters" only when something is active, and it clears everything but the tab', async () => {
    const { user, search } = renderAt('/?tab=week&campus=north&open=1');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(search()).toBe('?tab=week');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('is operable from the keyboard', async () => {
    const { user, search } = renderAt();

    await user.tab(); // first chip: Central
    expect(document.activeElement).toBe(chip('Campus', 'Central'));
    await user.keyboard('{Enter}');
    await user.tab();
    await user.keyboard(' ');

    expect(search()).toBe('?campus=central%2Cnorth');
  });
});
