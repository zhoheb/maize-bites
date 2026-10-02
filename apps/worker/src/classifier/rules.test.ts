import { describe, expect, it } from 'vitest';
import { normalizeHappeningItem } from '../happening/normalize.js';
import { happeningItemSchema } from '../happening/schema.js';
import { sampleFeed, sampleItem } from '../test/fixture.js';
import { DEFAULT_RULES } from './rules-config.js';
import { compileRules, prefilter } from './rules.js';

const check = (title: string, description: string | null = null, tags: string[] = []) =>
  prefilter({ title, description, tags });

describe('prefilter: candidates', () => {
  it.each([
    ['Pizza Night', null],
    ['Info session', 'Snacks and boba will be there.'],
    ['Open House', 'Light refreshments.'],
    ['Study break', 'Grab DONUTS and cookies in the lobby.'],
    ['Career chat', 'Food provided!'],
    ['Seminar', 'Lunch will be served at noon.'],
    ['Seminar', 'Food will be\nserved after the talk.'],
    ['Welcome back', 'Bagels & coffee from 9–10.'],
    ['Club meeting', "Hors d'oeuvres to follow"],
  ])('%j / %j', (title, description) => {
    expect(check(title, description).candidate).toBe(true);
  });

  it.each([['Food'], ['free'], ['FREE'], ['free food'], ['Breakfast']])('tag %j', (tag) => {
    const verdict = check('Lecture', null, [tag]);
    expect(verdict.candidate).toBe(true);
    expect(verdict.matches).toContain(`tag:${tag}`);
  });

  it('reports what matched', () => {
    expect(check('Free pizza and boba', null, ['Food']).matches).toEqual([
      'tag:Food',
      'free pizza',
      'pizza',
      'boba',
    ]);
  });
});

describe('prefilter: non-candidates', () => {
  it.each([
    ['Algebraic Geometry Seminar', 'Crepant resolutions via stacks.'],
    ['Pizzazz: a jazz night', null],
    ['Snackable content workshop', null],
    ['Launch party for the new app', null],
    ['Seminar', null],
  ])('%j / %j', (title, description) => {
    expect(check(title, description)).toEqual({ candidate: false, matches: [], excludedBy: null });
  });

  it.each([['Lecture'], ['Free Speech'], ['Art']])('ignores unrelated tag %j', (tag) => {
    expect(check('Talk', null, [tag]).candidate).toBe(false);
  });
});

describe('prefilter: paid-food exclusions', () => {
  it.each([
    ['Bake sale', 'Cookies and brownies for the club.', 'paid: "bake sale"'],
    ['Coffee promo', 'Free cup with any purchase', 'paid: "with any purchase"'],
    ['Lunch', 'Food trucks: tacos available for purchase', 'paid: "for purchase"'],
    ['Pizza fundraiser', 'Slices $3 each', 'price near "pizza"'],
    ['Brunch', 'Tickets: $ 25, includes brunch', 'price near "brunch"'],
    ['Cafe', 'All coffee drinks 20% off', 'paid: "% off"'],
  ])('%j / %j', (title, description, excludedBy) => {
    const verdict = check(title, description);
    expect(verdict.candidate).toBe(false);
    expect(verdict.excludedBy).toBe(excludedBy);
  });

  it('keeps explicit free-food statements even when a price appears', () => {
    expect(check('Free pizza before the show', 'Show tickets $10 at the door').candidate).toBe(
      true,
    );
    expect(check('Networking', 'Snacks provided. Parking is $5.').candidate).toBe(true);
  });

  it('ignores prices far away from any food word', () => {
    const filler = 'x '.repeat(40);
    expect(
      check('Concert', `Tickets are $15. ${filler} Refreshments at intermission.`).candidate,
    ).toBe(true);
  });

  it('applies exclusions to tag-only matches too', () => {
    expect(check('Club bake sale', null, ['Food']).candidate).toBe(false);
  });
});

describe('prefilter: config', () => {
  it('uses an edited config', () => {
    const rules = compileRules({ ...DEFAULT_RULES, foodKeywords: ['kombucha'], candidateTags: [] });
    expect(
      prefilter({ title: 'Kombucha tasting', description: null, tags: [] }, rules).candidate,
    ).toBe(true);
    expect(prefilter({ title: 'Pizza', description: null, tags: ['Food'] }, rules).candidate).toBe(
      false,
    );
  });

  it('is stable across repeated calls (no regex state leaks)', () => {
    const input = { title: 'Free pizza', description: null, tags: [] };
    const results = Array.from({ length: 5 }, () => prefilter(input).candidate);
    expect(results).toEqual([true, true, true, true, true]);
  });
});

describe('prefilter on the captured feed', () => {
  const verdictFor = (id: string) => prefilter(normalizeHappeningItem(sampleItem(id)).event);

  it('flags the obvious free-food events', () => {
    expect(verdictFor('150925-21910442').candidate).toBe(true); // "Pop-Up Free Lunch"
    expect(verdictFor('151404-21911531').candidate).toBe(true); // tags: Breakfast, free food
  });

  it('passes over events with no food signal', () => {
    expect(verdictFor('149657-21906898').candidate).toBe(false); // Algebraic Geometry Seminar
  });

  it('keeps the LLM workload a minority of the feed', () => {
    const verdicts = sampleFeed.map((raw) =>
      prefilter(normalizeHappeningItem(happeningItemSchema.parse(raw)).event),
    );
    const candidates = verdicts.filter((v) => v.candidate).length;
    // Measured on this fixture: 76/200 (many via the "Free" tag, which often means free admission).
    expect(candidates).toBeLessThan(100);
    expect(candidates).toBeGreaterThan(20);
  });
});
