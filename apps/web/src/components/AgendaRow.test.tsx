import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { expectAccessible } from '../test/axe';
import { makeEvent } from '../test/fixtures';
import { AgendaRow } from './AgendaRow';
import type { EventCardProps } from './NowCard';

// Fixture: Oct 1 16:00–17:30 UTC (noon–1:30 PM in Ann Arbor), Duderstadt Center room 1180.
const clean = (s: string | null | undefined) => (s ?? '').replace(/\u202f/g, ' ');

function renderRow(props: Partial<EventCardProps> = {}) {
  return render(
    <MemoryRouter>
      <AgendaRow
        event={makeEvent({ foodItems: ['pizza', 'boba'] })}
        href="/?event=abc"
        {...props}
      />
    </MemoryRouter>,
  );
}

const row = () => screen.getByRole('article');

describe('AgendaRow', () => {
  it('puts the time in a rail: start clock, period, and end', () => {
    renderRow();
    const time = row().querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe('2026-10-01T16:00:00.000Z');
    expect(clean(time?.textContent)).toBe('12:00 PM');
    expect(row().textContent).toContain('to 1:30');
  });

  it('shows the time once, with no countdown or status pill repeating it', () => {
    renderRow();
    expect(row().querySelectorAll('time')).toHaveLength(1);
    expect(row().textContent).not.toMatch(/Starts in|Today|Happening/);
  });

  it('leaves the end off when the listing gives none', () => {
    renderRow({ event: makeEvent({ endsAt: null }) });
    expect(row().textContent).not.toContain('to ');
  });

  it('shows the title on one line with the full title as a tooltip', () => {
    const title = 'An evening with the Center for Southeast Asian Studies: film and reception';
    renderRow({ event: makeEvent({ title }) });
    const link = within(row()).getByRole('link', { name: title });
    expect(link.getAttribute('title')).toBe(title);
    expect(link.parentElement?.className).toContain('truncate');
  });

  it('puts food then place beneath the title', () => {
    renderRow();
    expect(row().textContent).toContain('Food: Pizza, boba · Location: Duderstadt Center · 1180');
  });

  it('shows the place alone when no food was extracted', () => {
    renderRow({ event: makeEvent({ foodItems: [], mealType: null }) });
    expect(row().textContent).not.toContain('Food:');
    expect(row().textContent).toContain('Location: Duderstadt Center · 1180');
  });

  it('badges only the exceptions, with RSVP shortened', () => {
    const open = renderRow({ event: makeEvent({ audience: 'open' }) });
    expect(screen.queryByRole('list', { name: 'Good to know' })).toBeNull();
    expect(row().textContent).not.toContain('Open to all');
    open.unmount();

    const members = renderRow({ event: makeEvent({ audience: 'members' }) });
    expect(screen.getByRole('list', { name: 'Good to know' }).textContent).toBe('Members only');
    members.unmount();

    renderRow({ event: makeEvent({ audience: 'rsvp', likelyGone: true }) });
    expect(
      within(screen.getByRole('list', { name: 'Good to know' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Likely over', 'RSVP required']);
  });

  it('shows two dietary labels and counts the rest, naming them for screen readers', () => {
    renderRow({ event: makeEvent({ dietary: ['vegan', 'halal', 'kosher', 'gluten_free'] }) });
    const items = within(screen.getByRole('list', { name: 'Dietary' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'VeganVegan',
      'HalalHalal',
      '+2Kosher, Gluten-free',
    ]);
  });

  it('marks the selected row with the maize wash and nothing else with maize', () => {
    const selected = renderRow({ selected: true });
    expect(row().className).toContain('bg-maize-soft');
    selected.unmount();
    renderRow();
    expect(row().className).not.toContain('maize');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderRow({
      event: makeEvent({
        audience: 'rsvp',
        dietary: ['vegan', 'halal', 'kosher'],
        likelyGone: true,
      }),
      distance: '4 min walk',
    });
    await expectAccessible(container);
  });
});
