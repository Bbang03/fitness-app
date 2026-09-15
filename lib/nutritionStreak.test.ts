import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateNutritionStreak,
} from './nutritionStreak';

import type {
  MealLog,
} from './types';


function meal(
  date: string,
  id = date,
): MealLog {
  return {
    id: `meal-${id}`,
    user_id: 'user',
    date,
    meal_type: '점심',
    items: [
      {
        id: `item-${id}`,
        meal_log_id: `meal-${id}`,
        food_name: '식사',
        serving: '1인분',
        kcal: 500,
        carbs_g: 60,
        protein_g: 30,
        fat_g: 15,
      },
    ],
  };
}


test('counts one day only once even with multiple meal logs', () => {
  const result =
    calculateNutritionStreak(
      [
        meal('2026-09-15', 'lunch'),
        meal('2026-09-15', 'dinner'),
      ],
      '2026-09-15',
    );

  assert.deepEqual(
    result,
    {
      days: 1,
      todayRecorded: true,
    },
  );
});


test('counts consecutive days through today', () => {
  const result =
    calculateNutritionStreak(
      [
        meal('2026-09-12'),
        meal('2026-09-13'),
        meal('2026-09-14'),
        meal('2026-09-15'),
      ],
      '2026-09-15',
    );

  assert.deepEqual(
    result,
    {
      days: 4,
      todayRecorded: true,
    },
  );
});


test('keeps yesterday streak alive when today is not recorded yet', () => {
  const result =
    calculateNutritionStreak(
      [
        meal('2026-09-12'),
        meal('2026-09-13'),
        meal('2026-09-14'),
      ],
      '2026-09-15',
    );

  assert.deepEqual(
    result,
    {
      days: 3,
      todayRecorded: false,
    },
  );
});


test('resets streak after a fully missed day', () => {
  const result =
    calculateNutritionStreak(
      [
        meal('2026-09-12'),
        meal('2026-09-13'),
      ],
      '2026-09-15',
    );

  assert.deepEqual(
    result,
    {
      days: 0,
      todayRecorded: false,
    },
  );
});


test('starts again from one when a new day is recorded after a gap', () => {
  const result =
    calculateNutritionStreak(
      [
        meal('2026-09-10'),
        meal('2026-09-15'),
      ],
      '2026-09-15',
    );

  assert.deepEqual(
    result,
    {
      days: 1,
      todayRecorded: true,
    },
  );
});


test('ignores empty meal rows', () => {
  const emptyMeal: MealLog = {
    ...meal('2026-09-15'),
    items: [],
  };

  const result =
    calculateNutritionStreak(
      [
        meal('2026-09-14'),
        emptyMeal,
      ],
      '2026-09-15',
    );

  assert.deepEqual(
    result,
    {
      days: 1,
      todayRecorded: false,
    },
  );
});
