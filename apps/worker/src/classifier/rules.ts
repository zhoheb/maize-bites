import { DEFAULT_RULES, type RulesConfig } from './rules-config.js';

export interface RulesInput {
  title: string;
  description?: string | null | undefined;
  tags?: readonly string[] | undefined;
}

export interface RulesVerdict {
  /** Worth sending to the LLM. */
  candidate: boolean;
  /** What matched: `tag:Food`, `pizza`, ... */
  matches: string[];
  /** Why an otherwise-matching event was dropped, if it was. */
  excludedBy: string | null;
}

interface Phrase {
  phrase: string;
  pattern: RegExp;
}

function compile(phrases: readonly string[]): Phrase[] {
  return phrases.map((phrase) => {
    const body = phrase
      .trim()
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    // Word boundaries only where the phrase itself starts/ends with a letter or digit, so
    // "% off" still matches "20% off". Non-global: .test() on a /g regex is stateful.
    const before = /^[a-z0-9]/i.test(phrase.trim()) ? '(?<![a-z0-9])' : '';
    const after = /[a-z0-9]$/i.test(phrase.trim()) ? '(?![a-z0-9])' : '';
    return { phrase, pattern: new RegExp(`${before}${body}${after}`, 'i') };
  });
}

const PRICE = /\$\s?\d/g;

export interface CompiledRules {
  config: RulesConfig;
  tags: Set<string>;
  food: Phrase[];
  free: Phrase[];
  paid: Phrase[];
}

export function compileRules(config: RulesConfig = DEFAULT_RULES): CompiledRules {
  return {
    config,
    tags: new Set(config.candidateTags.map((t) => t.toLowerCase())),
    food: compile(config.foodKeywords),
    free: compile(config.freeFoodPhrases),
    paid: compile(config.paidPhrases),
  };
}

const DEFAULT_COMPILED = compileRules();

/** Stage 1: cheap, deterministic, tuned for recall. The LLM handles precision. */
export function prefilter(
  input: RulesInput,
  rules: CompiledRules = DEFAULT_COMPILED,
): RulesVerdict {
  const text = `${input.title}\n${input.description ?? ''}`;

  // A tag counts if it's a candidate tag or itself reads as food ("free food", "Breakfast").
  const tagMatches = (input.tags ?? [])
    .filter(
      (t) =>
        rules.tags.has(t.trim().toLowerCase()) ||
        [...rules.free, ...rules.food].some((p) => p.pattern.test(t)),
    )
    .map((t) => `tag:${t}`);
  const freeMatches = rules.free.filter((p) => p.pattern.test(text)).map((p) => p.phrase);

  const foodPositions: { phrase: string; index: number; end: number }[] = [];
  for (const { phrase, pattern } of rules.food) {
    for (const m of text.matchAll(new RegExp(pattern.source, 'gi')))
      foodPositions.push({ phrase, index: m.index, end: m.index + m[0].length });
  }
  const foodMatches = [...new Set(foodPositions.map((p) => p.phrase))];

  const matches = [
    ...tagMatches,
    ...freeMatches,
    ...foodMatches.filter((f) => !freeMatches.includes(f)),
  ];
  if (matches.length === 0) return { candidate: false, matches, excludedBy: null };

  // An explicit "free food"-style statement beats any sign of selling.
  if (freeMatches.length === 0) {
    const paid = rules.paid.find((p) => p.pattern.test(text));
    if (paid) return { candidate: false, matches, excludedBy: `paid: "${paid.phrase}"` };

    const window = rules.config.priceWindowChars;
    for (const price of text.matchAll(PRICE)) {
      const near = foodPositions.find(
        (f) => price.index >= f.index - window && price.index <= f.end + window,
      );
      if (near) return { candidate: false, matches, excludedBy: `price near "${near.phrase}"` };
    }
  }

  return { candidate: true, matches, excludedBy: null };
}
