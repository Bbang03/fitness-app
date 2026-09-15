import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canStartMealSave,
  mealDraftStorageKey,
  mealSaveDestination,
  mealValidationSummary,
  MEAL_NUTRITION_LIMITS,
  normalizeMealNutrition,
  sanitizeMealLogs,
  validateMealItem,
  validateMealItems,
} from './mealSave';

test('meal save guard blocks empty, unauthenticated, and duplicate submissions', () => {
  assert.equal(canStartMealSave(false, false, 1), false);
  assert.equal(canStartMealSave(true, true, 1), false);
  assert.equal(canStartMealSave(true, false, 0), false);
  assert.equal(canStartMealSave(true, false, 2), true);
});

test('meal save destination preserves the selected date', () => {
  assert.equal(mealSaveDestination('2026-09-11'), '/meals?date=2026-09-11');
  assert.equal(mealSaveDestination('2026-09-11/점심'), '/meals?date=2026-09-11%2F%EC%A0%90%EC%8B%AC');
});

test('meal drafts are isolated by user, date, and meal type', () => {
  assert.equal(
    mealDraftStorageKey('2026-09-11', '점심', 'user-a'),
    'fittrack:meal-draft:user-a:2026-09-11:%EC%A0%90%EC%8B%AC',
  );
  assert.notEqual(
    mealDraftStorageKey('2026-09-11', '점심', 'user-a'),
    mealDraftStorageKey('2026-09-12', '점심', 'user-a'),
  );
  assert.notEqual(
    mealDraftStorageKey('2026-09-11', '점심', 'user-a'),
    mealDraftStorageKey('2026-09-11', '저녁', 'user-a'),
  );
});

const validItem = {
  food_name: '닭가슴살 샐러드',
  serving: '200g',
  kcal: 200,
  carbs_g: 12.5,
  protein_g: 30,
  fat_g: 4.2,
};

test('meal validation accepts zero and decimal nutrition values', () => {
  assert.deepEqual(
    validateMealItem({
      ...validItem,
      kcal: 0,
      carbs_g: 0.5,
      protein_g: 0,
      fat_g: 0.1,
    }),
    {},
  );
});

test('meal validation rejects negative nutrition values field by field', () => {
  const issues = validateMealItems([
    { ...validItem, kcal: -1 },
    { ...validItem, carbs_g: -0.1 },
    { ...validItem, protein_g: -2 },
    { ...validItem, fat_g: -3 },
  ]);

  assert.deepEqual(
    issues.map(({ index, field }) => ({ index, field })),
    [
      { index: 0, field: 'kcal' },
      { index: 1, field: 'carbs_g' },
      { index: 2, field: 'protein_g' },
      { index: 3, field: 'fat_g' },
    ],
  );
  assert.match(issues[0].message, /0 이상/);
});

test('meal validation rejects nonfinite and unrealistic nutrition values', () => {
  const issues = validateMealItems([
    { ...validItem, kcal: Number.POSITIVE_INFINITY },
    { ...validItem, carbs_g: Number.NaN },
    { ...validItem, protein_g: MEAL_NUTRITION_LIMITS.protein_g + 0.1 },
    { ...validItem, fat_g: MEAL_NUTRITION_LIMITS.fat_g + 1 },
  ]);

  assert.deepEqual(
    issues.map(({ index, field }) => ({ index, field })),
    [
      { index: 0, field: 'kcal' },
      { index: 1, field: 'carbs_g' },
      { index: 2, field: 'protein_g' },
      { index: 3, field: 'fat_g' },
    ],
  );
  assert.match(issues[0].message, /유한한 숫자/);
  assert.match(issues[2].message, /300 이하/);
});

test('historical invalid nutrition is excluded from normalized meal logs', () => {
  const valid = {
    id: 'item-valid',
    meal_log_id: 'log-1',
    food_name: '밥',
    serving: '1공기',
    kcal: 250,
    carbs_g: 55,
    protein_g: 5,
    fat_g: 1,
  };
  const invalid = {
    ...valid,
    id: 'item-invalid',
    kcal: -10,
  };

  assert.deepEqual(normalizeMealNutrition(valid), {
    kcal: 250,
    carbs_g: 55,
    protein_g: 5,
    fat_g: 1,
  });
  assert.equal(normalizeMealNutrition(invalid), null);
  const sanitized = sanitizeMealLogs([
      {
        id: 'log-1',
        user_id: 'user-1',
        date: '2026-09-11',
        meal_type: '점심',
        items: [valid, invalid],
      },
    ]);

  assert.deepEqual(
    sanitized[0].items.map((item) => item.id),
    ['item-valid', 'item-invalid'],
  );
  assert.equal(sanitized[0].items[1].kcal, -10);
});

test('manual-form validation can leave optional blank macros for zero defaults', () => {
  assert.deepEqual(
    validateMealItem(
      {
        food_name: validItem.food_name,
        serving: validItem.serving,
        kcal: '0',
        carbs_g: '',
        protein_g: '',
        fat_g: '',
      },
      { allowBlankOptionalMacros: true },
    ),
    {},
  );

  assert.equal(validateMealItem({ ...validItem, kcal: '' }).kcal, '칼로리를 입력해주세요.');
  assert.equal(validateMealItem({ ...validItem, carbs_g: '' }).carbs_g, '탄수화물을 입력해주세요.');
});

test('batch validation identifies the item and field in the save error', () => {
  const [issue] = validateMealItems([
    validItem,
    { ...validItem, fat_g: -1 },
  ]);

  assert.equal(issue.index, 1);
  assert.equal(
    mealValidationSummary(issue, 2),
    '음식 2: 지방은 0 이상으로 입력해주세요.',
  );
});
