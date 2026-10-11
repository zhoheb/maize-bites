import { describe, expect, it } from 'vitest';
import { eventAt, eventId } from '../test/fixtures';
import { freshness, hero } from './hero';

const NOW = new Date('2026-10-01T18:00:00Z');
const live = eventAt(NOW, -20, 60, { id: eventId(1) });
const gone = eventAt(NOW, -30, 60, { id: eventId(2), likelyGone: true });
const soon = eventAt(NOW, 40, 60, {
  id: eventId(3),
  title: 'Bagel break',
  foodItems: ['bagels', 'coffee'],
  building: { id: eventId(90), name: 'Michigan Union', campus: 'central' },
});
const tomorrow = eventAt(NOW, 24 * 60, 60, { id: eventId(4) });

describe('hero', () => {
  it('on Now, counts what is live, leaving out events that are likely over', () => {
    expect(hero('now', [live, gone, soon], NOW)).toEqual({
      text: '1 spot with free food right now',
      next: null,
    });
    expect(hero('now', [live, { ...live, id: eventId(5) }], NOW).text).toBe(
      '2 spots with free food right now',
    );
  });

  it('on Now with nothing live, points at what is next', () => {
    expect(hero('now', [gone, soon], NOW)).toEqual({
      text: 'Nothing right now — next up:',
      next: { id: soon.id, text: 'Bagels at Michigan Union in 40 min' },
    });
  });

  it('names the event by its title when no food was extracted, and skips an unknown place', () => {
    const plain = { ...soon, foodItems: [], building: null };
    expect(hero('now', [plain], NOW).next?.text).toBe('Bagel break in 40 min');
  });

  it('on Now with nothing at all, says so', () => {
    expect(hero('now', [], NOW)).toEqual({ text: 'Nothing right now', next: null });
  });

  it('on Today and This Week, counts the list being shown', () => {
    expect(hero('today', [live, soon], NOW).text).toBe('2 spots today');
    expect(hero('week', [live, soon, tomorrow], NOW).text).toBe('3 spots this week');
    expect(hero('today', [live], NOW).text).toBe('1 spot today');
    expect(hero('week', [], NOW).text).toBe('0 spots this week');
  });

  it('marks a count as a floor when more pages are still to load', () => {
    expect(hero('week', [live, soon], NOW, true).text).toBe('2+ spots this week');
  });
});

describe('freshness', () => {
  const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

  it('is fresh under 15 minutes, aging under 2 hours, old beyond', () => {
    expect(freshness(ago(0), NOW)).toBe('fresh');
    expect(freshness(ago(14), NOW)).toBe('fresh');
    expect(freshness(ago(15), NOW)).toBe('aging');
    expect(freshness(ago(74), NOW)).toBe('aging'); // "1 hr 14 min ago" is not fresh
    expect(freshness(ago(120), NOW)).toBe('old');
  });
});
