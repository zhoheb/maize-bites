import type { FoodEvent } from '@maize-bites/shared';

export function makeEvent(overrides: Partial<FoodEvent> = {}): FoodEvent {
  return {
    id: '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11',
    source: 'happening',
    title: 'Pizza at the Dude',
    description: null,
    startsAt: '2026-10-01T16:00:00.000Z',
    endsAt: '2026-10-01T17:30:00.000Z',
    locationName: 'Duderstadt Center Rm 1180',
    room: '1180',
    building: {
      id: '0b0e8f3a-2c1d-4e5f-8a9b-1c2d3e4f5a6b',
      name: 'Duderstadt Center',
      campus: 'north',
    },
    lat: 42.29118,
    lng: -83.71577,
    url: 'https://events.umich.edu/event/1',
    sponsor: null,
    foodItems: ['pizza'],
    mealType: 'lunch',
    dietary: [],
    audience: 'open',
    likelyGone: false,
    ...overrides,
  };
}
