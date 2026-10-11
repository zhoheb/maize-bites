import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { groupEvents } from '../lib/grouping';
import { eventAt, eventId } from '../test/fixtures';
import { EventList } from './EventList';

const NOW = new Date('2026-10-01T18:00:00Z');
const DAY = 24 * 60;

const live = eventAt(NOW, -20, 60, { id: eventId(1), title: 'Live' });
const gone = eventAt(NOW, -30, 60, { id: eventId(2), title: 'Gone', likelyGone: true });
const imminent = eventAt(NOW, 20, 60, { id: eventId(3), title: 'Imminent' });
const inAnHour = eventAt(NOW, 70, 60, { id: eventId(4), title: 'In an hour' });
const tomorrowA = eventAt(NOW, DAY, 60, { id: eventId(5), title: 'Tomorrow A' });
const tomorrowB = eventAt(NOW, DAY + 60, 60, { id: eventId(6), title: 'Tomorrow B' });

function renderList(events = [live, gone, imminent, inAnHour, tomorrowA, tomorrowB]) {
  return render(
    <MemoryRouter>
      <EventList
        groups={groupEvents(events, NOW)}
        now={NOW}
        hrefFor={(id) => `/?event=${id}`}
        selectedId={null}
        highlightedId={null}
        onHover={() => undefined}
      />
    </MemoryRouter>,
  );
}

const kind = (title: string) => screen.getByRole('article', { name: title }).dataset['card'];

describe('EventList', () => {
  it('gives the prominent card to what is live or starts within 30 minutes, rows to the rest', () => {
    renderList();
    expect(kind('Live')).toBe('now');
    expect(kind('Imminent')).toBe('now');
    expect(kind('In an hour')).toBe('row');
    expect(kind('Tomorrow A')).toBe('row');
  });

  it('gives a likely-over event a quiet row even while it is live', () => {
    renderList();
    expect(kind('Gone')).toBe('row');
  });

  it('heads each group, and puts a section’s rows in one panel separated by hairlines', () => {
    renderList();
    const tomorrow = screen.getByRole('region', { name: /Tomorrow/ });
    // Label, date, then the count of events in the group.
    expect(
      [...within(tomorrow).getByRole('heading', { level: 2 }).children].map((c) => c.textContent),
    ).toEqual(['Tomorrow', '· Fri, Oct 2', '2']);
    const panels = tomorrow.querySelectorAll('ul.divide-y');
    expect(panels).toHaveLength(1);
    expect(within(tomorrow).getAllByRole('article')).toHaveLength(2);
  });

  it('staggers the entrance of the first eight rows only', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      eventAt(NOW, DAY + i * 10, 30, { id: eventId(20 + i), title: `Row ${i}` }),
    );
    renderList(many);
    const delays = screen
      .getAllByRole('article')
      .map((a) => a.closest('li')?.style.animationDelay ?? '');
    expect(delays.slice(0, 8)).toEqual([
      '0ms',
      '30ms',
      '60ms',
      '90ms',
      '120ms',
      '150ms',
      '180ms',
      '210ms',
    ]);
    expect(delays.slice(8)).toEqual(['', '', '', '']);
  });
});
