import {
  CAMPUS_TIME_ZONE,
  wallTimeOf,
  type Audience,
  type DietaryTag,
  type MealType,
} from '@maize-bites/shared';
import type { ClassifierInput } from './input.js';
import {
  DEFAULT_RULES,
  RULES_MODE,
  type RulesConfig,
  type RulesModeConfig,
} from './rules-config.js';
import { compile, type Phrase } from './rules.js';

// The decision layer for CLASSIFIER_MODE=rules, where no LLM checks the rules' work. It favors
// precision: an event is published only when the listing plainly says food is being given
// away, and any sign of money or of bringing your own vetoes it. All vocabulary lives in
// rules-config.ts.

export type RulesModeReason =
  /** The organizer's "free food" perk. */
  | 'perk'
  /** An explicit statement such as "lunch provided". */
  | 'phrase'
  /** A food word with "free", "provided", "served"... right next to it. */
  | 'proximity'
  /** Money, a potluck, a food truck, a dining hall... */
  | 'hard_negative'
  /** Food is mentioned, but nothing says it is free. */
  | 'weak'
  /** No food at all. */
  | 'none';

export interface RulesModeVerdict {
  hasFreeFood: boolean;
  confidence: number;
  reason: RulesModeReason;
  /** The matched phrase with some of the listing around it; for a negative, why not. */
  evidence: string | null;
  foodItems: string[];
  mealType: MealType | null;
  dietary: DietaryTag[];
  audience: Audience;
}

interface Hit {
  phrase: string;
  index: number;
  end: number;
}

function hits(phrases: readonly Phrase[], text: string): Hit[] {
  const found: Hit[] = [];
  for (const { phrase, pattern } of phrases) {
    for (const m of text.matchAll(new RegExp(pattern.source, 'gi')))
      found.push({ phrase, index: m.index, end: m.index + m[0].length });
  }
  return found.sort((a, b) => a.index - b.index || b.end - a.end);
}

/** Replaces each match with spaces of the same length, so positions in the text don't move. */
function blank(text: string, phrases: readonly Phrase[]): string {
  let out = text;
  for (const { index, end } of hits(phrases, text))
    out = out.slice(0, index) + ' '.repeat(end - index) + out.slice(end);
  return out;
}

export interface CompiledRulesMode {
  config: RulesModeConfig;
  perkTags: Set<string>;
  strong: Phrase[];
  food: Phrase[];
  generic: Set<string>;
  beforeFoodOnly: Set<string>;
  giving: Phrase[];
  notGiving: Phrase[];
  negatives: Phrase[];
  exemptions: Phrase[];
  price: RegExp;
  dietary: [DietaryTag, Phrase[]][];
  members: Phrase[];
  rsvp: Phrase[];
  mealWords: [MealType, Phrase[]][];
}

export function compileRulesMode(
  config: RulesModeConfig = RULES_MODE,
  base: RulesConfig = DEFAULT_RULES,
): CompiledRulesMode {
  const symbols = config.currencySymbols
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return {
    config,
    perkTags: new Set(config.perkTags.map((t) => t.toLowerCase())),
    strong: compile([...new Set([...base.freeFoodPhrases, ...config.strongPhrases])]),
    food: compile([...new Set([...base.foodKeywords, ...config.extraFoodWords])]),
    generic: new Set(config.genericFoodWords.map((w) => w.toLowerCase())),
    giving: compile(config.givingWords),
    beforeFoodOnly: new Set(config.givingWordsBeforeFoodOnly.map((w) => w.toLowerCase())),
    notGiving: compile(config.notGivingPhrases),
    negatives: compile(config.hardNegatives),
    exemptions: compile(config.negativeExemptions),
    price: new RegExp(`(?:${symbols})\\s?\\d`),
    dietary: (Object.entries(config.dietary) as [DietaryTag, readonly string[]][]).map(
      ([tag, phrases]) => [tag, compile(phrases)],
    ),
    members: compile(config.membersPhrases),
    rsvp: compile(config.rsvpPhrases),
    mealWords: config.mealWords.map(([meal, words]) => [meal, compile(words)]),
  };
}

const DEFAULT_COMPILED = compileRulesMode();

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The matched span with about `context` characters of the listing on each side, widened to
 * whole words and put on one line.
 */
function excerpt(text: string, from: number, to: number, context: number): string {
  let start = Math.max(0, from - context);
  let end = Math.min(text.length, to + context);
  while (start > 0 && !/\s/.test(text.charAt(start - 1))) start -= 1;
  while (end < text.length && !/\s/.test(text.charAt(end))) end += 1;
  const before = text.slice(0, start).trim() === '' ? '' : '…';
  const after = text.slice(end).trim() === '' ? '' : '…';
  return `${before}${oneLine(text.slice(start, end))}${after}`;
}

function mealTypeOf(text: string, startsAt: Date, rules: CompiledRulesMode): MealType | null {
  for (const [meal, words] of rules.mealWords) if (hits(words, text).length > 0) return meal;
  const local = wallTimeOf(startsAt, CAMPUS_TIME_ZONE);
  const hour = local.hour + local.minute / 60;
  return rules.config.mealHours.find(([, from, to]) => hour >= from && hour < to)?.[0] ?? null;
}

/** The final free-food verdict for one event when the rules are the only judge. */
export function decideRulesMode(
  input: ClassifierInput,
  rules: CompiledRulesMode = DEFAULT_COMPILED,
): RulesModeVerdict {
  const { config } = rules;
  const text = `${input.title}\n${input.description ?? ''}`;
  const any = (phrases: readonly Phrase[]) => hits(phrases, text).length > 0;

  const foodHits = hits(rules.food, text);
  const named = [...new Set(foodHits.map((h) => h.phrase.toLowerCase()))];
  const specific = named.filter((word) => !rules.generic.has(word));
  const audience: Audience = any(rules.members) ? 'members' : any(rules.rsvp) ? 'rsvp' : 'open';
  const details = {
    foodItems: specific.length > 0 ? specific : named,
    mealType: mealTypeOf(text, input.startsAt, rules),
    dietary: rules.dietary.filter(([, phrases]) => any(phrases)).map(([tag]) => tag),
    audience,
  };
  const no = (reason: RulesModeReason, evidence: string | null): RulesModeVerdict => ({
    hasFreeFood: false,
    confidence: config.confidence.negative,
    reason,
    evidence,
    ...details,
  });
  const yes = (
    reason: RulesModeReason,
    confidence: number,
    evidence: string,
  ): RulesModeVerdict => ({
    hasFreeFood: true,
    confidence,
    reason,
    evidence,
    ...details,
  });

  // 1. Hard negatives veto everything, including the perk. The feed's cost field counts too.
  const costText = `${text}\n${input.cost ?? ''}`;
  const priced = blank(costText, rules.exemptions);
  const [negative] = hits(rules.negatives, priced);
  if (negative)
    return no(
      'hard_negative',
      excerpt(costText, negative.index, negative.end, config.evidenceContextChars),
    );
  const price = rules.price.exec(priced);
  if (price)
    return no(
      'hard_negative',
      excerpt(costText, price.index, price.index + price[0].length, config.evidenceContextChars),
    );

  // 2. The organizer's own "free food" perk.
  const perk = input.tags.find((tag) => rules.perkTags.has(tag.trim().toLowerCase()));
  if (perk !== undefined) return yes('perk', config.confidence.perk, `tag: ${perk.trim()}`);

  // "Gluten-free", "feel free", "free and open to the public" say nothing about free food.
  const cleaned = blank(text, rules.notGiving);

  // 3. An explicit statement.
  const [strong] = hits(rules.strong, cleaned);
  if (strong)
    return yes(
      'phrase',
      config.confidence.strong,
      excerpt(text, strong.index, strong.end, config.evidenceContextChars),
    );

  // 4. A food word with a giving word right next to it ("free Insomnia cookies",
  //    "pizza and pop will be provided").
  const givingHits = hits(rules.giving, cleaned);
  for (const food of foodHits) {
    const giving = givingHits.find(
      (g) =>
        g.end >= food.index - config.givingWindowChars &&
        g.index <= food.end + config.givingWindowChars &&
        (!rules.beforeFoodOnly.has(g.phrase.toLowerCase()) || g.index < food.index),
    );
    if (giving)
      return yes(
        'proximity',
        config.confidence.strong,
        excerpt(
          text,
          Math.min(food.index, giving.index),
          Math.max(food.end, giving.end),
          config.evidenceContextChars,
        ),
      );
  }

  // 5. Food is mentioned at most in passing.
  const [firstFood] = foodHits;
  return firstFood
    ? no('weak', excerpt(text, firstFood.index, firstFood.end, config.evidenceContextChars))
    : no('none', null);
}
