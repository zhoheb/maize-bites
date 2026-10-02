// Stage 1 prefilter vocabulary. Edit freely. Matching is case-insensitive, on word
// boundaries, and any whitespace in a phrase matches any run of whitespace.
// rules.test.ts has the behavior contract; `pnpm --filter worker eval` measures the effect.

export interface RulesConfig {
  /** An event with any of these tags is a candidate. */
  candidateTags: readonly string[];
  /** Any of these in the title or description makes the event a candidate. */
  foodKeywords: readonly string[];
  /**
   * Explicit free-food statements. They count as keywords, and they override the paid-food
   * exclusions below ("Free pizza! Show tickets $10" stays a candidate).
   */
  freeFoodPhrases: readonly string[];
  /** Signs the food is being sold, not given away. */
  paidPhrases: readonly string[];
  /** A price ($5, $ 12.50) within this many characters of a food keyword means paid food. */
  priceWindowChars: number;
}

export const DEFAULT_RULES: RulesConfig = {
  candidateTags: ['food', 'free'],

  foodKeywords: [
    // meals
    'breakfast',
    'brunch',
    'lunch',
    'luncheon',
    'dinner',
    'supper',
    // generic
    'food',
    'snack',
    'snacks',
    'refreshments',
    'appetizers',
    "hors d'oeuvres",
    'light fare',
    'catered',
    'catering',
    'treats',
    'dessert',
    'desserts',
    // specific items
    'pizza',
    'boba',
    'bubble tea',
    'donuts',
    'doughnuts',
    'bagels',
    'cookies',
    'cupcakes',
    'cake',
    'ice cream',
    'popcorn',
    'tacos',
    'sandwiches',
    'burritos',
    'bbq',
    'barbecue',
    'coffee',
    'tea and cookies',
    'cider',
  ],

  freeFoodPhrases: [
    'free food',
    'free pizza',
    'free lunch',
    'free breakfast',
    'free dinner',
    'free snacks',
    'free boba',
    'free coffee',
    'free donuts',
    'free bagels',
    'free cookies',
    'free ice cream',
    'food provided',
    'food will be provided',
    'food will be served',
    'lunch provided',
    'lunch will be provided',
    'lunch will be served',
    'dinner provided',
    'dinner will be provided',
    'dinner will be served',
    'breakfast provided',
    'breakfast will be provided',
    'breakfast will be served',
    'refreshments provided',
    'refreshments will be provided',
    'refreshments will be served',
    'snacks provided',
    'snacks will be provided',
    'light refreshments',
    'complimentary food',
    'complimentary refreshments',
  ],

  paidPhrases: [
    'with any purchase',
    'with purchase',
    'for purchase',
    'available for purchase',
    'for sale',
    'bake sale',
    'food sale',
    'buy one get one',
    'bogo',
    '% off',
    'percent off',
  ],

  priceWindowChars: 40,
};
