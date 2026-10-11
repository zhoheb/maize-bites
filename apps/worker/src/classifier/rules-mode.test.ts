import { describe, expect, it } from 'vitest';
import type { ClassifierInput } from './input.js';
import { RULES_MODE } from './rules-config.js';
import { compileRulesMode, decideRulesMode, type RulesModeReason } from './rules-mode.js';

/** 3:00 PM in Ann Arbor: no meal is implied by the hour. */
const AFTERNOON = new Date('2026-10-09T19:00:00Z');

function input(overrides: Partial<ClassifierInput> = {}): ClassifierInput {
  return {
    title: 'General meeting',
    description: null,
    locationName: 'Mason Hall',
    room: null,
    startsAt: AFTERNOON,
    endsAt: null,
    tags: [],
    sponsor: null,
    cost: null,
    ...overrides,
  };
}

const decide = (
  title: string,
  description: string | null = null,
  extra: Partial<ClassifierInput> = {},
) => decideRulesMode(input({ title, description, ...extra }));

describe('decideRulesMode: what gets published', () => {
  const cases: [
    name: string,
    title: string,
    description: string | null,
    reason: RulesModeReason,
  ][] = [
    ['explicit "free food"', 'Study night', 'Come hang out. Free food!', 'phrase'],
    ['"free pizza" in the title', 'Free Pizza Friday', null, 'phrase'],
    ['"lunch provided"', 'Resume workshop', 'Lunch provided for all attendees.', 'phrase'],
    ['"dinner will be served"', 'Speaker series', 'Dinner will be served at 6.', 'phrase'],
    ['"refreshments provided"', 'Poster session', 'Refreshments provided.', 'phrase'],
    ['"light refreshments"', 'Book talk', 'Light refreshments to follow.', 'phrase'],
    ['"snacks provided"', 'Game night', 'Board games, snacks provided', 'phrase'],
    ['upper case and punctuation', 'MASS MEETING', 'FREE BOBA!!! (while it lasts)', 'phrase'],
    ['extra whitespace and line breaks', 'Info session', 'Food\n   will be\tprovided.', 'phrase'],
    [
      'free + a named brand before the food',
      'Welcome back',
      'Free Insomnia cookies for everyone',
      'proximity',
    ],
    ['food then "will be provided"', 'Town hall', 'Pizza and pop will be provided.', 'proximity'],
    ['food then "served"', 'Seminar', 'Coffee and bagels served at 9:45.', 'proximity'],
    [
      '"complimentary" before the food',
      'Open house',
      'Enjoy complimentary cider and donuts.',
      'proximity',
    ],
    ['"on us"', 'Meet the team', 'Tacos on us after the demo.', 'proximity'],
  ];

  it.each(cases)('%s', (_name, title, description, reason) => {
    const verdict = decide(title, description);
    expect(verdict).toMatchObject({ hasFreeFood: true, confidence: 0.75, reason });
  });

  it('publishes on the Free Food perk at higher confidence, whatever the text says', () => {
    for (const tags of [['Free Food'], ['Social', 'FreeFood'], [' free food ']]) {
      const verdict = decide('Weekly meeting', 'Agenda: elections.', { tags });
      expect(verdict).toMatchObject({ hasFreeFood: true, confidence: 0.85, reason: 'perk' });
      expect(verdict.evidence).toBe(`tag: ${(tags.at(-1) ?? '').trim()}`);
    }
  });
});

describe('decideRulesMode: what does not', () => {
  const cases: [
    name: string,
    title: string,
    description: string | null,
    reason: RulesModeReason,
  ][] = [
    ['no food at all', 'Chess club', 'Weekly rapid tournament.', 'none'],
    ['a lone "pizza"', 'Pizza and politics', 'Join us to talk about the midterms.', 'weak'],
    ['a lone "lunch"', 'Lunch and learn', 'Bring questions about co-ops.', 'weak'],
    ['a lone "coffee"', 'Coffee chat', 'Meet alumni in consulting.', 'weak'],
    ['"dinner" as a time, nothing given', 'Rehearsal', 'We break for dinner at 6.', 'weak'],
    ['"feel free" is not "free"', 'Picnic', 'Feel free to bring lunch and a blanket.', 'weak'],
    [
      '"free and open to the public" is about entry',
      'Recital',
      'Free and open to the public. Dessert reception.',
      'weak',
    ],
    [
      '"free" after the food belongs to something else',
      'Kickoff',
      'Pizza. Free shirts for the first 50.',
      'weak',
    ],
    [
      'asking hosts to offer refreshments is not having them',
      'CommuniTEA',
      'Organizations and units are encouraged to collaborate and offer light refreshments.',
      'weak',
    ],
    [
      'gluten-free is not free',
      'Baking club',
      'We are trying gluten-free cookies this week.',
      'weak',
    ],
    ['a price', 'Fall banquet', 'Dinner will be served. $15 per person.', 'hard_negative'],
    ['tickets', 'Gala', 'Free food and dancing. Tickets at the door.', 'hard_negative'],
    ['admission', 'Culture night', 'Free food with admission.', 'hard_negative'],
    ['"cost:"', 'Retreat', 'Lunch provided. Cost: see website.', 'hard_negative'],
    ['a fee', 'Workshop', 'Snacks provided. A small fee covers materials.', 'hard_negative'],
    [
      'food for purchase',
      'Night market',
      'Free entry; food available for purchase.',
      'hard_negative',
    ],
    ['food truck', 'Block party', 'Free food truck on site all afternoon!', 'hard_negative'],
    ['potluck', 'Friendsgiving', 'Potluck! Free food for all who bring some.', 'hard_negative'],
    [
      'bring a dish',
      'Harvest dinner',
      'Dinner provided, but please bring a dish to share.',
      'hard_negative',
    ],
    ['bake sale', 'Bake sale', 'Free samples of our cookies.', 'hard_negative'],
    ['fundraiser', 'Chipotle fundraiser', 'Free chips with your order.', 'hard_negative'],
    [
      'dining hall',
      'Late night breakfast',
      'Free breakfast at the South Quad dining hall.',
      'hard_negative',
    ],
    ['cooking class', 'Cooking class', 'Food provided; learn to make dumplings.', 'hard_negative'],
    ['bring your own', 'Hike', 'Lunch provided? No: bring your own.', 'hard_negative'],
    ['food not provided', 'Field trip', 'Lunch is not provided.', 'hard_negative'],
  ];

  it.each(cases)('%s', (_name, title, description, reason) => {
    expect(decide(title, description)).toMatchObject({
      hasFreeFood: false,
      confidence: 0.2,
      reason,
    });
  });

  it('lets a hard negative veto the perk and the cost field veto the text', () => {
    expect(
      decide('Formal', 'Dinner provided. Tickets required.', { tags: ['Free Food'] }),
    ).toMatchObject({ hasFreeFood: false, reason: 'hard_negative' });
    expect(decide('Pottery night', 'Free pizza', { cost: '$16 drop-in' })).toMatchObject({
      hasFreeFood: false,
      reason: 'hard_negative',
    });
  });

  it('does not treat "it costs nothing" wording as money', () => {
    for (const description of [
      'Free admission. Lunch provided.',
      'No tickets required. Free food!',
      'There is no cost to attend and dinner will be served.',
    ]) {
      expect(decide('Open event', description).hasFreeFood).toBe(true);
    }
    expect(decide('Talk', 'Free pizza', { cost: 'Free - no tickets required' }).hasFreeFood).toBe(
      true,
    );
  });
});

describe('decideRulesMode: extracted details', () => {
  it('quotes the matched phrase with about 60 characters of the listing around it', () => {
    const description =
      'Join the Robotics Club for our first build night of the term. Free pizza and pop while we sort parts. All majors welcome.';
    const { evidence } = decide('Build night', description);

    expect(evidence).toBe(
      '…first build night of the term. Free pizza and pop while we sort parts. All…',
    );
    // Verbatim from the listing, whole words only, and not much longer than the phrase + 60.
    expect(description).toContain((evidence ?? '').replaceAll('…', ''));
    expect((evidence ?? '').length).toBeLessThanOrEqual('free pizza'.length + 60 + 20);
  });

  it('uses the whole listing when it is short', () => {
    expect(decide('Free Pizza Friday').evidence).toBe('Free Pizza Friday');
  });

  it('says why a negative was rejected', () => {
    expect(decide('Banquet', 'Dinner will be served. $15 per person.').evidence).toBe(
      'Banquet Dinner will be served. $15 per person.',
    );
    expect(decide('Chess club').evidence).toBeNull();
  });

  it('lists specific food items, falling back to a generic word only when alone', () => {
    expect(decide('Social', 'Free food: pizza, cookies, and cider.').foodItems).toEqual([
      'pizza',
      'cookies',
      'cider',
    ]);
    expect(decide('Social', 'Free food!').foodItems).toEqual(['food']);
    expect(decide('Chess club').foodItems).toEqual([]);
  });

  it('reads the meal from the text only, never from the start time', () => {
    const at = (iso: string) => ({ startsAt: new Date(iso) });
    expect(decide('Kickoff', 'Lunch provided', at('2026-10-09T22:00:00Z')).mealType).toBe('lunch');
    expect(decide('Kickoff', 'Free brunch', at('2026-10-09T19:00:00Z')).mealType).toBe('breakfast');
    // No meal named, at 8:30 AM, 12:15 PM, and 6:00 PM in Ann Arbor: still no meal.
    expect(decide('Kickoff', 'Free bagels', at('2026-10-09T12:30:00Z')).mealType).toBeNull();
    expect(decide('Kickoff', 'Free pizza', at('2026-10-09T16:15:00Z')).mealType).toBeNull();
    expect(decide('Kickoff', 'Free pizza', at('2026-10-09T22:00:00Z')).mealType).toBeNull();
  });

  it('finds the lunch in a workshop listing whose title says nothing about food', () => {
    // The real "optiMize Social Innovation Challenge: Workshop 2" listing. Its card showed
    // "Lunch", which looked like a default. It isn't: the description promises lunch, and that
    // sentence is the evidence. A noon start alone would give no meal (see the test above).
    const verdict = decide(
      'optiMize Social Innovation Challenge: Workshop 2',
      [
        'Workshop #2 will focus on exploring the problem you wish to address.',
        'When: Sunday, October 11 from 11:30 am to 3:15 pm EST',
        'Where: Central Campus Classroom Building (CCCB) - room 0460',
        'Lunch will be provided along with the opportunity to meet lots of different people!',
      ].join('\n\n'),
      { startsAt: new Date('2026-10-11T15:15:00Z') },
    );
    expect(verdict).toMatchObject({ hasFreeFood: true, foodItems: ['lunch'], mealType: 'lunch' });
    expect(verdict.evidence).toContain('Lunch will be provided');

    const noFood = decide(
      'optiMize Social Innovation Challenge: Workshop 2',
      'Workshop #2 will focus on exploring the problem you wish to address.',
      { startsAt: new Date('2026-10-11T15:15:00Z') },
    );
    expect(noFood).toMatchObject({ hasFreeFood: false, mealType: null });
  });

  it('picks up dietary tags', () => {
    expect(
      decide('Dinner', 'Free food. Vegan, halal, and gluten-free options; kosher on request.')
        .dietary,
    ).toEqual(['vegan', 'halal', 'kosher', 'gluten_free']);
    expect(decide('Dinner', 'Free food, veggie option available').dietary).toEqual(['vegetarian']);
    expect(decide('Dinner', 'Free food').dietary).toEqual([]);
  });

  it('reads the audience: members, then RSVP, otherwise open', () => {
    expect(decide('Chapter', 'Free pizza for members only.').audience).toBe('members');
    expect(decide('Panel', 'Lunch provided. RSVP by Friday.').audience).toBe('rsvp');
    expect(decide('Panel', 'Lunch provided. Please register here.').audience).toBe('rsvp');
    expect(decide('Chapter', 'Members only. Register for free pizza.').audience).toBe('members');
    expect(decide('Social', 'Free pizza').audience).toBe('open');
  });
});

describe('compileRulesMode', () => {
  it('takes its vocabulary from the config, so the lists can be edited without touching the logic', () => {
    const rules = compileRulesMode({
      ...RULES_MODE,
      strongPhrases: ['grub is on'],
      hardNegatives: ['cover charge'],
    });
    expect(decideRulesMode(input({ title: 'Grub is on at 7' }), rules).hasFreeFood).toBe(true);
    expect(
      decideRulesMode(input({ title: 'Free pizza', description: 'Cover charge applies' }), rules),
    ).toMatchObject({ hasFreeFood: false, reason: 'hard_negative' });
    // "tickets" is no longer a negative in this config.
    expect(
      decideRulesMode(input({ title: 'Free pizza', description: 'Tickets at the door' }), rules)
        .hasFreeFood,
    ).toBe(true);
  });
});
