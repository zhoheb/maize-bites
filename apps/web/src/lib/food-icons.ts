import type { FoodEvent, MealType } from '@maize-bites/shared';
import {
  Cookie,
  CupSoda,
  EggFried,
  IceCreamCone,
  Sandwich,
  Utensils,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

export type FoodIconKind = MealType | 'dessert' | 'food';

export const FOOD_ICONS: Record<FoodIconKind, LucideIcon> = {
  breakfast: EggFried,
  lunch: Sandwich,
  dinner: UtensilsCrossed,
  snacks: Cookie,
  drinks: CupSoda,
  dessert: IceCreamCone,
  other: Utensils,
  food: Utensils,
};

const DESSERT =
  /\b(ice cream|sorbet|gelato|donuts?|doughnuts?|cake|cupcakes?|cookies?|brownies?|pie|candy|dessert)\b/i;

/**
 * Which icon stands for an event's food. The meal type comes only from the classifier; when it
 * gave none, the icon is generic (or a dessert, if the food items say so). The time of day is
 * never used to guess a meal.
 */
export function foodIconKind(event: Pick<FoodEvent, 'mealType' | 'foodItems'>): FoodIconKind {
  if (event.foodItems.length > 0 && event.foodItems.every((item) => DESSERT.test(item)))
    return 'dessert';
  return event.mealType ?? 'food';
}
