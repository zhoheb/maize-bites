import { FOOD_ICONS, type FoodIconKind } from '../lib/food-icons';

export function MealIcon({ kind, className }: { kind: FoodIconKind; className?: string }) {
  const Icon = FOOD_ICONS[kind];
  return <Icon aria-hidden="true" className={className} />;
}
