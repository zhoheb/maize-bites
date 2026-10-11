import { describe, expect, it } from 'vitest';
import { eventId, makeEvent } from '../test/fixtures';
import { matchesSearch, searchEvents } from './search';

const pizza = makeEvent(); // "Pizza at the Dude", Duderstadt Center, room 1180
const ramen = makeEvent({
  id: eventId(2),
  title: 'Anime club social',
  foodItems: ['ramen', 'mochi'],
  building: { id: eventId(90), name: 'Michigan Union', campus: 'central' },
  room: 'Pendleton Room',
  locationName: 'Michigan Union',
  sponsor: 'Animé Society',
});

describe('matchesSearch', () => {
  it('matches the title, the food items, and the building', () => {
    expect(matchesSearch(pizza, 'pizza')).toBe(true);
    expect(matchesSearch(ramen, 'ramen')).toBe(true);
    expect(matchesSearch(ramen, 'union')).toBe(true);
    expect(matchesSearch(pizza, 'union')).toBe(false);
  });

  it('also matches the room and the host', () => {
    expect(matchesSearch(ramen, 'pendleton')).toBe(true);
    expect(matchesSearch(ramen, 'society')).toBe(true);
  });

  it('ignores case and accents, and needs every word', () => {
    expect(matchesSearch(pizza, 'DUDE')).toBe(true);
    expect(matchesSearch(ramen, 'anime')).toBe(true);
    expect(matchesSearch(ramen, 'ramen union')).toBe(true);
    expect(matchesSearch(ramen, 'ramen dude')).toBe(false);
  });

  it('matches everything for a blank query', () => {
    expect(matchesSearch(pizza, '   ')).toBe(true);
    expect(searchEvents([pizza, ramen], '')).toEqual([pizza, ramen]);
    expect(searchEvents([pizza, ramen], 'mochi')).toEqual([ramen]);
  });
});
