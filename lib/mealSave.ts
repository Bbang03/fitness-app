import type {
  MealLog,
} from './types';

export function canStartMealSave(
  hasUser: boolean,
  isSaving: boolean,
  itemCount: number,
) {
  return hasUser && !isSaving && itemCount > 0;
}

export function mealSaveDestination(date: string) {
  return `/meals?date=${encodeURIComponent(date)}`;
}

/**
 * Keep an in-progress manual entry separate for each account, date, and
 * meal.  The account component prevents a draft from appearing after a user
 * switch while the date and meal type prevent one meal from overwriting
 * another.
 */
export function mealDraftStorageKey(
  date: string,
  mealType: string,
  userId = 'anonymous',
) {
  return `fittrack:meal-draft:${encodeURIComponent(userId)}:${encodeURIComponent(date)}:${encodeURIComponent(mealType)}`;
}

/**
 * The values below are per saved meal item, rather than per day. They leave
 * room for a large restaurant meal while catching the values that are almost
 * certainly unit mistakes or malformed input.
 */
export const MEAL_NUTRITION_LIMITS = {
  kcal: 5_000,
  carbs_g: 500,
  protein_g: 300,
  fat_g: 300,
} as const;

export const MEAL_NUTRITION_LABELS = {
  kcal: '칼로리',
  carbs_g: '탄수화물',
  protein_g: '단백질',
  fat_g: '지방',
} as const;

const MEAL_NUTRITION_SUBJECTS = {
  kcal: '칼로리는',
  carbs_g: '탄수화물은',
  protein_g: '단백질은',
  fat_g: '지방은',
} as const;

export type MealNutritionField = keyof typeof MEAL_NUTRITION_LIMITS;

export type MealValidationField =
  | 'food_name'
  | 'serving'
  | MealNutritionField;

export interface MealSaveItemInput {
  food_name: unknown;
  serving: unknown;
  kcal: unknown;
  carbs_g: unknown;
  protein_g: unknown;
  fat_g: unknown;
}

export type MealNutritionInput = Pick<
  MealSaveItemInput,
  MealNutritionField
>;

export interface MealNutritionValues {
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
}

export type MealItemValidationErrors = Partial<
  Record<MealValidationField, string>
>;

export interface MealValidationIssue {
  index: number;
  field: MealValidationField;
  message: string;
}

export interface MealValidationOptions {
  /** Used by the manual form before blank optional macros become zero. */
  allowBlankOptionalMacros?: boolean;
}

const MEAL_NUTRITION_FIELDS: readonly MealNutritionField[] = [
  'kcal',
  'carbs_g',
  'protein_g',
  'fat_g',
];

function isBlank(value: unknown) {
  return value === null || value === undefined ||
    (typeof value === 'string' && value.trim() === '');
}

function asNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return null;
}

function requiredMessage(field: MealValidationField) {
  const messages: Record<MealValidationField, string> = {
    food_name: '음식 이름을 입력해주세요.',
    serving: '섭취량을 입력해주세요.',
    kcal: '칼로리를 입력해주세요.',
    carbs_g: '탄수화물을 입력해주세요.',
    protein_g: '단백질을 입력해주세요.',
    fat_g: '지방을 입력해주세요.',
  };
  return messages[field];
}

function finiteMessage(field: MealNutritionField) {
  return `${MEAL_NUTRITION_SUBJECTS[field]} 유한한 숫자로 입력해주세요.`;
}

function minimumMessage(field: MealNutritionField) {
  return `${MEAL_NUTRITION_SUBJECTS[field]} 0 이상으로 입력해주세요.`;
}

function maximumMessage(field: MealNutritionField) {
  return `${MEAL_NUTRITION_SUBJECTS[field]} ${MEAL_NUTRITION_LIMITS[field].toLocaleString('ko-KR')} 이하로 입력해주세요.`;
}

/**
 * Validate one item before it is turned into a local or remote meal record.
 * Empty optional macro inputs are accepted only when explicitly requested by
 * the manual form; the save boundary always uses the strict default.
 */
export function validateMealItem(
  item: MealSaveItemInput,
  options: MealValidationOptions = {},
): MealItemValidationErrors {
  const errors: MealItemValidationErrors = {};

  if (
    typeof item.food_name !== 'string' ||
    item.food_name.trim() === ''
  ) {
    errors.food_name = requiredMessage('food_name');
  }

  if (
    typeof item.serving !== 'string' ||
    item.serving.trim() === ''
  ) {
    errors.serving = requiredMessage('serving');
  }

  for (const field of MEAL_NUTRITION_FIELDS) {
    const value = item[field];

    if (isBlank(value)) {
      if (
        field !== 'kcal' &&
        options.allowBlankOptionalMacros
      ) {
        continue;
      }

      errors[field] = requiredMessage(field);
      continue;
    }

    const parsed = asNumber(value);
    if (parsed === null || !Number.isFinite(parsed)) {
      errors[field] = finiteMessage(field);
      continue;
    }

    if (parsed < 0) {
      errors[field] = minimumMessage(field);
      continue;
    }

    if (parsed > MEAL_NUTRITION_LIMITS[field]) {
      errors[field] = maximumMessage(field);
    }
  }

  return errors;
}

/**
 * Return canonical numeric nutrition only when every nutrition field is
 * finite and within the same bounds used by the save validator.  Returning
 * null lets read and aggregate boundaries drop one corrupt item as a whole,
 * avoiding a partial total that could look trustworthy.
 */
export function normalizeMealNutrition(
  item: MealNutritionInput,
): MealNutritionValues | null {
  const values = {} as MealNutritionValues;

  for (const field of MEAL_NUTRITION_FIELDS) {
    const parsed = asNumber(item[field]);

    if (
      parsed === null ||
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      parsed > MEAL_NUTRITION_LIMITS[field]
    ) {
      return null;
    }

    values[field] = parsed;
  }

  return values;
}

/**
 * Copy meal logs at the store hydration/read boundary while preserving every
 * historical item for display or later correction. Aggregators call
 * normalizeMealNutrition and skip malformed items instead of deleting them.
 */
export function sanitizeMealLogs(
  logs: readonly MealLog[],
): MealLog[] {
  return logs.map((log) => ({
    ...log,
    items: (Array.isArray(log.items) ? log.items : []).map((item) => ({ ...item })),
  }));
}

/**
 * Validate every item at the single save boundary used by manual, database,
 * external-search, and photo-recognition flows.
 */
export function validateMealItems(
  items: readonly MealSaveItemInput[],
): MealValidationIssue[] {
  const issues: MealValidationIssue[] = [];

  items.forEach((item, index) => {
    const errors = validateMealItem(item);
    for (const field of Object.keys(errors) as MealValidationField[]) {
      const message = errors[field];
      if (message) {
        issues.push({ index, field, message });
      }
    }
  });

  return issues;
}

export function mealValidationSummary(
  issue: MealValidationIssue,
  itemCount: number,
) {
  return itemCount > 1
    ? `음식 ${issue.index + 1}: ${issue.message}`
    : issue.message;
}
