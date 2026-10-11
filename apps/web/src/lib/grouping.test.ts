import { describe, expect, it } from 'vitest';
import { eventAt, eventId } from '../test/fixtures';
import { groupEvents } from './grouping';

// 2:00 PM on Thursday Oct 1 2026 in Ann Arbor.
const NOW = new Date('2026-10-01T18:00:00Z');
const HOUR = 60;
const DAY = 24 * HOUR;

const ev = (n: number, startMin: number, lengthMin = 60) =>
  eventAt(NOW, startMin, lengthMin, { id: eventId(n), title: `Event ${n}` });

describe('groupEvents', () => {
  it('orders groups by urgency: now, soon, later today, then each day', () => {
    const groups = groupEvents(
      [
        ev(1, -30), // live
        ev(2, 45), // within 2 hours
        ev(3, 5 * HOUR), // 7 PM today
        ev(4, DAY), // tomorrow
        ev(5, DAY + HOUR), // tomorrow
        ev(6, 3 * DAY), // Sunday
      ],
      NOW,
    );

    expect(groups.map((g) => [g.key, g.label, g.hint, g.events.map((e) => e.title)])).toEqual([
      ['now', 'Happening now', null, ['Event 1']],
      ['soon', 'Starting soon', 'next 2 hours', ['Event 2']],
      ['today', 'Later today', null, ['Event 3']],
      ['2026-10-02', 'Tomorrow', 'Fri, Oct 2', ['Event 4', 'Event 5']],
      ['2026-10-04', 'Sun, Oct 4', null, ['Event 6']],
    ]);
  });

  it('leaves out groups with nothing in them', () => {
    expect(groupEvents([ev(1, DAY)], NOW).map((g) => g.key)).toEqual(['2026-10-02']);
    expect(groupEvents([], NOW)).toEqual([]);
  });

  it('keeps the given order inside a group', () => {
    const [group] = groupEvents([ev(2, -10), ev(1, -50), ev(3, -5)], NOW);
    expect(group?.events.map((e) => e.title)).toEqual(['Event 2', 'Event 1', 'Event 3']);
  });

  it('puts events that are likely over last in their group', () => {
    const gone = { ...ev(1, -50), likelyGone: true };
    const [group] = groupEvents([gone, ev(2, -30), ev(3, -10)], NOW);
    expect(group?.events.map((e) => e.title)).toEqual(['Event 2', 'Event 3', 'Event 1']);
  });

  it('puts an event starting within two hours under soon even when that is past midnight', () => {
    const lateNight = new Date('2026-10-02T03:30:00Z'); // 11:30 PM Oct 1
    const groups = groupEvents([eventAt(lateNight, 60, 60)], lateNight);
    expect(groups.map((g) => g.key)).toEqual(['soon']);
  });

  it('sinks events that ended since the list was fetched to the bottom', () => {
    const groups = groupEvents([ev(1, -120, 60), ev(2, DAY), ev(3, -10)], NOW);
    expect(groups.map((g) => g.key)).toEqual(['now', '2026-10-02', 'ended']);
    expect(groups.at(-1)?.label).toBe('Just ended');
  });
});
