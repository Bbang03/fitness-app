import type {
  MealLog,
  NutritionSummary,
  WorkoutLog,
} from './types';

export type NutritionCalendarStatus =
  | 'future'
  | 'in_progress'
  | 'unrecorded'
  | 'goal_unavailable'
  | 'met'
  | 'below_target';

export type NutritionDeficitKey = 'kcal' | 'protein';

export interface CalendarNutritionGoals {
  kcal: number | null;
  protein_g: number | null;
}

export interface CalendarDaySummary {
  date: string;
  workouts: WorkoutLog[];
  completedWorkoutCount: number;
  exerciseNames: string[];
  totalSets: number;
  totalVolumeKg: number;
  mealCount: number;
  nutrition: NutritionSummary;
  nutritionStatus: NutritionCalendarStatus;
  deficitKeys: NutritionDeficitKey[];
}

export interface CalendarSummaryOptions {
  /** A YYYY-MM-DD key used to keep the pure aggregation deterministic in tests. */
  today?: string;
  /** The initial product threshold for marking a recorded goal as below target. */
  belowTargetRatio?: number;
}

export const DEFAULT_BELOW_TARGET_RATIO = 0.8;

const EMPTY_NUTRITION: NutritionSummary = {
  kcal: 0,
  carbs_g: 0,
  protein_g: 0,
  fat_g: 0,
};

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function emptySummary(date: string, today: string): CalendarDaySummary {
  return {
    date,
    workouts: [],
    completedWorkoutCount: 0,
    exerciseNames: [],
    totalSets: 0,
    totalVolumeKg: 0,
    mealCount: 0,
    nutrition: { ...EMPTY_NUTRITION },
    nutritionStatus:
      date > today
        ? 'future'
        : date === today
          ? 'in_progress'
          : 'unrecorded',
    deficitKeys: [],
  };
}

function summaryFor(
  summaries: Map<string, CalendarDaySummary>,
  date: string,
  today: string,
): CalendarDaySummary {
  const existing = summaries.get(date);

  if (existing) {
    return existing;
  }

  const created = emptySummary(date, today);
  summaries.set(date, created);
  return created;
}

function addVolume(summary: CalendarDaySummary, workout: WorkoutLog) {
  for (const set of workout.sets) {
    const weight = Number.isFinite(set.weight_kg) ? set.weight_kg : 0;
    const reps = Number.isFinite(set.reps) ? set.reps : 0;
    summary.totalVolumeKg += weight * reps;
  }
}

function finalizeNutritionStatus(
  summary: CalendarDaySummary,
  goals: CalendarNutritionGoals,
  today: string,
  belowTargetRatio: number,
) {
  if (summary.date > today) {
    summary.nutritionStatus = 'future';
    summary.deficitKeys = [];
    return;
  }

  if (summary.date === today) {
    summary.nutritionStatus = 'in_progress';
    summary.deficitKeys = [];
    return;
  }

  if (summary.mealCount === 0) {
    summary.nutritionStatus = 'unrecorded';
    summary.deficitKeys = [];
    return;
  }

  const kcalGoal = isPositiveFinite(goals.kcal) ? goals.kcal : null;
  const proteinGoal = isPositiveFinite(goals.protein_g) ? goals.protein_g : null;

  if (kcalGoal === null && proteinGoal === null) {
    summary.nutritionStatus = 'goal_unavailable';
    summary.deficitKeys = [];
    return;
  }

  const deficitKeys: NutritionDeficitKey[] = [];

  if (kcalGoal !== null && summary.nutrition.kcal / kcalGoal < belowTargetRatio) {
    deficitKeys.push('kcal');
  }

  if (
    proteinGoal !== null &&
    summary.nutrition.protein_g / proteinGoal < belowTargetRatio
  ) {
    deficitKeys.push('protein');
  }

  summary.deficitKeys = deficitKeys;
  summary.nutritionStatus = deficitKeys.length > 0 ? 'below_target' : 'met';
}

/**
 * Aggregates the already-loaded dashboard logs into one summary per calendar day.
 * This function deliberately has no store, browser, or date-fns dependency so the
 * product rules can be tested without rendering the dashboard.
 */
export function buildCalendarDaySummaries(
  workoutLogs: readonly WorkoutLog[],
  mealLogs: readonly MealLog[],
  goals: CalendarNutritionGoals,
  options: CalendarSummaryOptions = {},
): Map<string, CalendarDaySummary> {
  const today = options.today ?? localDateKey(new Date());
  const belowTargetRatio =
    typeof options.belowTargetRatio === 'number' &&
    Number.isFinite(options.belowTargetRatio) &&
    options.belowTargetRatio > 0 &&
    options.belowTargetRatio <= 1
      ? options.belowTargetRatio
      : DEFAULT_BELOW_TARGET_RATIO;

  const summaries = new Map<string, CalendarDaySummary>();

  for (const workout of workoutLogs) {
    // A started or cancelled workout is not a completed activity on the calendar.
    if (!workout.finished_at || !workout.date) {
      continue;
    }

    const summary = summaryFor(summaries, workout.date, today);
    summary.workouts.push(workout);
    summary.completedWorkoutCount += 1;
    summary.totalSets += workout.sets.length;
    addVolume(summary, workout);

    for (const set of workout.sets) {
      const name = set.exercise_name.trim();
      if (name && !summary.exerciseNames.includes(name)) {
        summary.exerciseNames.push(name);
      }
    }
  }

  for (const meal of mealLogs) {
    // Empty meal_log rows are not a meal record and must not trigger a warning.
    if (!meal.date || meal.items.length === 0) {
      continue;
    }

    const summary = summaryFor(summaries, meal.date, today);
    summary.mealCount += 1;

    for (const item of meal.items) {
      summary.nutrition.kcal += Number.isFinite(item.kcal) ? item.kcal : 0;
      summary.nutrition.carbs_g += Number.isFinite(item.carbs_g) ? item.carbs_g : 0;
      summary.nutrition.protein_g += Number.isFinite(item.protein_g) ? item.protein_g : 0;
      summary.nutrition.fat_g += Number.isFinite(item.fat_g) ? item.fat_g : 0;
    }
  }

  for (const summary of summaries.values()) {
    finalizeNutritionStatus(summary, goals, today, belowTargetRatio);
    summary.totalVolumeKg = Math.round(summary.totalVolumeKg * 100) / 100;
  }

  return summaries;
}

/** Returns an empty selectable day for dates with no loaded records. */
export function createEmptyCalendarDaySummary(
  date: string,
  today = localDateKey(new Date()),
): CalendarDaySummary {
  return emptySummary(date, today);
}
