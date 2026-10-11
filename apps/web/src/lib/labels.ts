import type { Audience, Campus, DietaryTag, MealType } from '@maize-bites/shared';

export const CAMPUS_LABELS: Record<Campus, string> = {
  central: 'Central',
  north: 'North',
  medical: 'Medical',
  athletic: 'Athletic',
};

export const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
  nut_free: 'Nut-free',
  halal: 'Halal',
  kosher: 'Kosher',
};

/** Compact forms for cards. Screen readers get the full label. */
export const DIETARY_SHORT: Record<DietaryTag, string> = {
  vegetarian: 'Veg',
  vegan: 'Vegan',
  gluten_free: 'GF',
  dairy_free: 'DF',
  nut_free: 'Nut-free',
  halal: 'Halal',
  kosher: 'Kosher',
};

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  drinks: 'Drinks',
  other: 'Other',
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  open: 'Open to all',
  members: 'Members only',
  rsvp: 'RSVP required',
};
