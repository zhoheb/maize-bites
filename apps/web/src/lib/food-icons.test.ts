import { describe, expect, it } from 'vitest';
import { foodIconKind } from './food-icons';

describe('foodIconKind', () => {
  it('uses the meal the classifier extracted', () => {
    expect(foodIconKind({ mealType: 'breakfast', foodItems: ['bagels'] })).toBe('breakfast');
    expect(foodIconKind({ mealType: 'drinks', foodItems: ['boba'] })).toBe('drinks');
  });

  it('is generic when no meal was extracted, whatever the food', () => {
    expect(foodIconKind({ mealType: null, foodItems: ['pizza'] })).toBe('food');
    expect(foodIconKind({ mealType: null, foodItems: [] })).toBe('food');
  });

  it('shows dessert when every item is a sweet', () => {
    expect(foodIconKind({ mealType: 'snacks', foodItems: ['ice cream', 'sorbet'] })).toBe(
      'dessert',
    );
    expect(foodIconKind({ mealType: null, foodItems: ['donuts'] })).toBe('dessert');
    expect(foodIconKind({ mealType: 'snacks', foodItems: ['cookies', 'coffee'] })).toBe('snacks');
  });
});
