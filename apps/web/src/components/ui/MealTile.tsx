import { FOOD_ICONS, type FoodIconKind } from '../../lib/food-icons';
import { cx } from './cx';

// Each meal has a soft tint, so a column of rows can be scanned by colour as well as by word.
const TINTS: Record<FoodIconKind, string> = {
  breakfast: 'bg-meal-breakfast text-meal-breakfast-ink',
  lunch: 'bg-meal-lunch text-meal-lunch-ink',
  dinner: 'bg-meal-dinner text-meal-dinner-ink',
  snacks: 'bg-meal-snacks text-meal-snacks-ink',
  dessert: 'bg-meal-snacks text-meal-snacks-ink',
  drinks: 'bg-meal-drinks text-meal-drinks-ink',
  other: 'bg-meal-other text-meal-other-ink',
  food: 'bg-meal-other text-meal-other-ink',
};

const SIZES = {
  sm: 'size-5 rounded-md [&>svg]:size-3',
  md: 'size-10 rounded-xl [&>svg]:size-4.5',
} as const;

/** A tinted tile with the icon for a kind of food. Decorative: the food is named beside it. */
export function MealTile({
  kind,
  size = 'md',
  muted = false,
  className,
}: {
  kind: FoodIconKind;
  size?: keyof typeof SIZES;
  /** Neutral instead of tinted, for an event that is likely over. */
  muted?: boolean;
  className?: string | undefined;
}) {
  const Icon = FOOD_ICONS[kind];
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center',
        SIZES[size],
        muted ? 'bg-meal-other text-ink-3' : TINTS[kind],
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
