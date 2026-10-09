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

// ---------------------------------------------------------------------------
// Rules mode (CLASSIFIER_MODE=rules)
// ---------------------------------------------------------------------------
// With no LLM, the rules are the final judge, so this layer is strict where the prefilter above
// is generous: it publishes only on an explicit statement that food is being given away, and any
// sign of money vetoes it. Edit freely; rules-mode.test.ts has the behavior contract and
// `pnpm --filter worker eval --mode rules` measures precision and recall.

export interface RulesModeConfig {
  /** Event tags that mean the organizer ticked a "free food" perk. Compared case-insensitively. */
  perkTags: readonly string[];
  /** Explicit statements, beyond `freeFoodPhrases` above, that publish on their own. */
  strongPhrases: readonly string[];
  /** Food words rules mode knows in addition to `foodKeywords` above. */
  extraFoodWords: readonly string[];
  /** Too vague to list as a food item ("food", "catering") unless nothing more specific matched. */
  genericFoodWords: readonly string[];
  /** A food word with one of these within `givingWindowChars` reads as food being given away. */
  givingWords: readonly string[];
  givingWindowChars: number;
  /**
   * Giving words that only count in front of the food: "free pizza" is a statement, but in
   * "pizza. Free shirts" the word belongs to something else.
   */
  givingWordsBeforeFoodOnly: readonly string[];
  /** Phrases that contain a giving word but say nothing about food. Removed before matching. */
  notGivingPhrases: readonly string[];
  /** Any of these vetoes the event, whatever else it says. */
  hardNegatives: readonly string[];
  /** Currency symbols; one followed by a digit is a price, which is a hard negative. */
  currencySymbols: readonly string[];
  /** Phrases that contain a hard negative but mean "it costs nothing". Removed before matching. */
  negativeExemptions: readonly string[];
  dietary: Readonly<
    Record<'vegan' | 'vegetarian' | 'halal' | 'kosher' | 'gluten_free', readonly string[]>
  >;
  membersPhrases: readonly string[];
  rsvpPhrases: readonly string[];
  /** A meal named in the text decides the meal type. First match in this order wins. */
  mealWords: readonly (readonly ['breakfast' | 'lunch' | 'dinner', readonly string[]])[];
  /** Otherwise the local start hour does, when it falls in one of these [from, to) ranges. */
  mealHours: readonly (readonly ['breakfast' | 'lunch' | 'dinner', number, number])[];
  confidence: { perk: number; strong: number; negative: number };
  /** Characters of the listing kept on each side of the matched phrase in `evidence`. */
  evidenceContextChars: number;
}

export const RULES_MODE: RulesModeConfig = {
  perkTags: ['free food', 'freefood', 'free-food'],

  strongPhrases: [
    'free samples',
    'free treats',
    'free dessert',
    'free desserts',
    'free brunch',
    'free cider',
    'free popcorn',
    'free tacos',
    'free cupcakes',
    'free bubble tea',
    'free refreshments',
    'pizza provided',
    'pizza will be provided',
    'pizza will be served',
    'snacks will be served',
    'dinner is provided',
    'lunch is provided',
    'breakfast is provided',
    'food is provided',
    'refreshments are provided',
    'snacks are provided',
    'complimentary lunch',
    'complimentary dinner',
    'complimentary breakfast',
    'complimentary snacks',
    'complimentary coffee',
    'food and drinks provided',
    'food and drinks will be provided',
    'food and drink provided',
    'catered lunch',
    'catered dinner',
  ],

  extraFoodWords: [
    'donut',
    'doughnut',
    'bagel',
    'cookie',
    'cupcake',
    'sandwich',
    'taco',
    'burrito',
    'samosas',
    'sushi',
    'wings',
    'hot dogs',
    'burgers',
    'pasta',
    'salad',
    'fruit',
    'pastries',
    'muffins',
    'pancakes',
    'waffles',
    'candy',
    'chocolate',
    'hot chocolate',
    'hot cocoa',
    'lemonade',
    'smoothies',
    'meal',
    'meals',
  ],

  genericFoodWords: [
    'food',
    'catered',
    'catering',
    'treats',
    'refreshments',
    'light fare',
    'meal',
    'meals',
  ],

  givingWords: [
    'free',
    'complimentary',
    'provided',
    'served',
    'on us',
    'on the house',
    'included',
    'for everyone',
    'for all attendees',
    'while supplies last',
    'help yourself',
  ],
  givingWindowChars: 25,
  givingWordsBeforeFoodOnly: ['free', 'complimentary'],

  notGivingPhrases: [
    // An invitation to hosts to supply food, not a statement that there is some.
    'offer light refreshments',
    'offer refreshments',
    'feel free',
    'free to',
    'free time',
    'free and open to the public',
    'free and open',
    'free event',
    'free admission',
    'free of charge',
    'free speech',
    'gluten-free',
    'gluten free',
    'dairy-free',
    'dairy free',
    'nut-free',
    'nut free',
    'sugar-free',
    'fragrance-free',
    'smoke-free',
    'free parking',
    'free shuttle',
    'free shirt',
    't-shirts provided',
    'materials provided',
    'childcare provided',
    'supplies provided',
    'equipment provided',
    'transportation provided',
  ],

  hardNegatives: [
    // money
    'tickets',
    'ticket',
    'ticketed',
    'admission',
    'cost:',
    'fee',
    'fees',
    'for purchase',
    'available for purchase',
    'with purchase',
    'with any purchase',
    'for sale',
    'bake sale',
    'food sale',
    'cash bar',
    'cash only',
    'venmo',
    'buy one get one',
    'bogo',
    '% off',
    'percent off',
    'fundraiser',
    // not given away by the host
    'food truck',
    'food trucks',
    'potluck',
    'pot luck',
    'bring a dish',
    'bring your own',
    'byo',
    'on your own',
    'not provided',
    'not be provided',
    'no food',
    // dining services, not events
    'dining hall',
    'dining halls',
    'mdining',
    'meal plan',
    'meal swipe',
    'meal swipes',
    'dining dollars',
    'blue bucks',
    // classes about food
    'cooking class',
    'cooking classes',
  ],
  currencySymbols: ['$'],

  negativeExemptions: [
    'free admission',
    'admission is free',
    'no admission',
    'no tickets',
    'no ticket',
    'tickets are free',
    'free tickets',
    'no cost',
    'no fee',
    'no fees',
    'no registration fee',
    'at no charge',
  ],

  dietary: {
    vegan: ['vegan'],
    vegetarian: ['vegetarian', 'veggie'],
    halal: ['halal'],
    kosher: ['kosher'],
    gluten_free: ['gluten-free', 'gluten free', 'gf options', 'gf option'],
  },

  membersPhrases: [
    'members only',
    'members-only',
    'for members',
    'for club members',
    'dues-paying',
  ],
  rsvpPhrases: [
    'rsvp',
    'register',
    'registration required',
    'registration is required',
    'sign up',
    'signup',
    'reserve your spot',
  ],

  mealWords: [
    ['breakfast', ['breakfast', 'brunch']],
    ['lunch', ['lunch', 'luncheon']],
    ['dinner', ['dinner', 'supper']],
  ],
  mealHours: [
    ['breakfast', 7, 10.5],
    ['lunch', 11, 14],
    ['dinner', 17, 20.5],
  ],

  confidence: { perk: 0.85, strong: 0.75, negative: 0.2 },
  evidenceContextChars: 30,
};
