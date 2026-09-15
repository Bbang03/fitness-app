import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDailyComment,
  canShowDailyCommentPrediction,
  completedWorkoutLogsWithinDays,
  dailyCommentMealRecordStatus,
  type DailyCommentPrediction,
} from './dailyComment';
import type {
  InbodyRecord,
  MealLog,
  SetLog,
  WorkoutLog,
} from './types';

const DATE = '2026-09-14';

function meal(
  id: string,
  nutrition: {
    kcal: number;
    protein_g: number;
    carbs_g?: number;
    fat_g?: number;
  },
  mealType: MealLog['meal_type'] = '저녁',
): MealLog {
  return {
    id,
    user_id: 'user',
    date: DATE,
    meal_type: mealType,
    items: [
      {
        id: `${id}-item`,
        meal_log_id: id,
        food_name: '식사',
        serving: '1인분',
        kcal: nutrition.kcal,
        carbs_g: nutrition.carbs_g ?? 50,
        protein_g: nutrition.protein_g,
        fat_g: nutrition.fat_g ?? 20,
      },
    ],
  };
}

function set(
  exercise_name: string,
  set_number: number,
  weight_kg = 60,
  reps = 8,
): SetLog {
  return {
    id: `${exercise_name}-${set_number}`,
    workout_log_id: 'workout',
    exercise_name,
    set_number,
    weight_kg,
    reps,
    actual_rest_seconds: 90,
    record_type: 'weight_reps',
  };
}

function workout(
  finished_at: string | null = `${DATE}T10:00:00.000Z`,
): WorkoutLog {
  return {
    id: 'workout-1',
    user_id: 'user',
    routine_id: 'routine',
    routine_name: '상체 루틴',
    date: DATE,
    started_at: `${DATE}T09:00:00.000Z`,
    finished_at,
    sets: [
      set('벤치프레스', 1),
      set('벤치프레스', 2),
      set('벤치프레스', 3),
    ],
  };
}

function inbody(): InbodyRecord {
  return {
    id: 'inbody-1',
    user_id: 'user',
    measured_at: '2026-09-01',
    weight_kg: 70,
    skeletal_muscle_kg: 32,
    body_fat_kg: 14,
    body_fat_pct: 20,
  };
}

const prediction: DailyCommentPrediction = {
  horizonDays: 30,
  predictedWeightKg: 69.7,
  predictedSkeletalMuscleKg: 32.2,
  predictedBodyFatKg: 13.7,
  predictedBodyFatPct: 19.7,
  confidence: 'medium',
  modelVersion: 'baseline-v1',
};

function completeMeals(
  kcal: number,
  protein_g: number,
): MealLog[] {
  return [
    meal('meal-breakfast', { kcal: kcal / 3, protein_g: protein_g / 3 }, '아침'),
    meal('meal-lunch', { kcal: kcal / 3, protein_g: protein_g / 3 }, '점심'),
    meal('meal-dinner', { kcal: kcal / 3, protein_g: protein_g / 3 }, '저녁'),
  ];
}

test('combines workout and protein evidence into a natural daily comment', () => {
  const report = buildDailyComment({
    date: DATE,
    mealLogs: completeMeals(1_800, 72),
    workoutLogs: [workout()],
    targets: { kcal: 2_000, protein_g: 120 },
    latestMeasuredBodyComposition: inbody(),
    prediction,
  });

  assert.equal(
    report.comment,
    '운동한 거에 비해, 단백질이 부족한 하루였어요.',
  );
  assert.equal(report.status, 'ready');
  assert.equal(report.nutrition.summary.protein_g, 72);
  assert.equal(report.workout.completedWorkoutCount, 1);
  assert.ok(report.evidence.some((item) => item.id === 'protein_below_target'));
  assert.equal(
    report.evidence.some((item) => item.id === 'kcal_below_target'),
    false,
  );
  assert.equal(report.bodyComposition.measured?.source, 'measured');
  assert.equal(report.bodyComposition.prediction?.source, 'predicted');
  assert.match(report.bodyComposition.note ?? '', /실제 측정/);
  assert.match(report.bodyComposition.note ?? '', /예측값은 실제 측정값이 아니라/);
});

test('shows an ISO measurement timestamp as a date-only value', () => {
  const measured = inbody();
  measured.measured_at = '2026-09-03T00:00:00+00:00';

  const report = buildDailyComment({
    date: DATE,
    mealLogs: [],
    workoutLogs: [],
    latestMeasuredBodyComposition: measured,
  });

  assert.equal(report.bodyComposition.measured?.measuredAt, '2026-09-03');
  const measuredEvidence = report.evidence.find(
    (item) => item.id === 'measured_body_composition',
  );
  assert.match(measuredEvidence?.detail ?? '', /2026-09-03 측정/);
  assert.doesNotMatch(measuredEvidence?.detail ?? '', /T00:00:00/);
});

test('does not call protein deficient when nutrition is missing', () => {
  const report = buildDailyComment({
    date: DATE,
    mealLogs: [],
    workoutLogs: [workout()],
    targets: { kcal: 2_000, protein_g: 120 },
  });

  assert.equal(report.status, 'incomplete');
  assert.match(report.comment, /식단 기록이 없어/);
  assert.equal(report.nutrition.status, 'missing');
  assert.equal(
    report.evidence.some((item) => item.id === 'protein_below_target'),
    false,
  );
  assert.equal(report.nutrition.targetRatios.protein_g, null);
});

test('qualifies conclusions when only part of the day is recorded', () => {
  const report = buildDailyComment({
    date: DATE,
    mealLogs: [meal('meal-1', { kcal: 900, protein_g: 40 })],
    workoutLogs: [workout()],
    targets: { kcal: 2_000, protein_g: 120 },
    mealRecordStatus: 'partial',
  });

  assert.equal(report.status, 'incomplete');
  assert.match(report.comment, /일부라/);
  assert.doesNotMatch(report.comment, /단백질|열량/);
  assert.match(report.nextAction, /남은 정규 식사/);
  assert.ok(report.evidence.some((item) => item.id === 'nutrition_partial'));
  assert.equal(
    report.evidence.some((item) => item.id === 'protein_below_target'),
    false,
  );
  assert.equal(
    report.evidence.some((item) => item.id === 'kcal_below_target'),
    false,
  );
});

test('praises a day when recorded exercise and nutrition meet both targets', () => {
  const report = buildDailyComment({
    date: DATE,
    mealLogs: completeMeals(2_100, 125),
    workoutLogs: [workout()],
    targets: { kcal: 2_000, protein_g: 120 },
  });

  assert.equal(report.status, 'ready');
  assert.match(report.comment, /운동과 회복을 위한 영양 섭취가 잘 맞은/);
  assert.equal(report.positivePoint, '운동과 식단을 함께 기록했어요.');
  assert.ok(report.evidence.some((item) => item.id === 'nutrition_meets_targets'));
});

test('suppresses a prediction that has no real measured baseline', () => {
  const report = buildDailyComment({
    date: DATE,
    mealLogs: completeMeals(2_000, 120),
    workoutLogs: [],
    targets: { kcal: 2_000, protein_g: 120 },
    prediction,
  });

  assert.equal(report.bodyComposition.measured, null);
  assert.equal(report.bodyComposition.prediction, null);
  assert.equal(report.bodyComposition.note, null);
  assert.ok(
    report.evidence.some((item) => item.id === 'prediction_without_measurement'),
  );
});

test('ignores unfinished workouts and malformed meal items without inventing intake', () => {
  const invalidMeal: MealLog = {
    ...meal('bad-meal', { kcal: 999, protein_g: 99 }),
    items: [
      {
        ...meal('bad-meal', { kcal: 999, protein_g: 99 }).items[0],
        kcal: -1,
      },
    ],
  };
  const report = buildDailyComment({
    date: DATE,
    mealLogs: [invalidMeal],
    workoutLogs: [workout(null)],
    targets: { kcal: 2_000, protein_g: 120 },
  });

  assert.equal(report.nutrition.status, 'missing');
  assert.equal(report.nutrition.summary.kcal, 0);
  assert.equal(report.nutrition.invalidItemCount, 1);
  assert.equal(report.workout.completedWorkoutCount, 0);
  assert.match(report.comment, /식단 기록이 없어/);
  assert.equal(
    report.evidence.some((item) => item.id === 'protein_below_target'),
    false,
  );
});

test('does not claim target alignment when no nutrition target was supplied', () => {
  const report = buildDailyComment({
    date: DATE,
    mealLogs: completeMeals(2_000, 120),
    workoutLogs: [workout()],
  });

  assert.match(report.comment, /목표를 설정하면/);
  assert.equal(report.nutrition.targetRatios.kcal, null);
  assert.equal(report.nutrition.targetRatios.protein_g, null);
  assert.equal(
    report.evidence.some((item) => item.id === 'nutrition_meets_targets'),
    false,
  );
});

test('treats a valid snack-only day as partial and never asserts a deficit', () => {
  const report = buildDailyComment({
    date: DATE,
    mealLogs: [meal('snack', { kcal: 200, protein_g: 8 }, '간식')],
    workoutLogs: [workout()],
    targets: { kcal: 2_000, protein_g: 120 },
  });

  assert.equal(dailyCommentMealRecordStatus(DATE, report.nutrition.status === 'partial'
    ? [meal('snack', { kcal: 200, protein_g: 8 }, '간식')]
    : []), 'partial');
  assert.equal(report.nutrition.status, 'partial');
  assert.doesNotMatch(report.comment, /단백질|열량/);
  assert.equal(report.evidence.some((item) => item.id === 'protein_below_target'), false);
  assert.equal(report.evidence.some((item) => item.id === 'kcal_below_target'), false);
});

test('recent workout volume excludes unfinished logs', () => {
  const now = new Date(`${DATE}T12:00:00.000Z`);
  const logs = [workout(), workout(null)];
  const completed = completedWorkoutLogsWithinDays(logs, now, 7);

  assert.equal(completed.length, 1);
  assert.equal(completed[0]?.finished_at, `${DATE}T10:00:00.000Z`);
});

test('requires every condition before showing the numeric 30-day prediction', () => {
  const base = {
    today: '2026-09-14',
    measuredAt: '2026-09-01',
    recordedNutritionDays: 7,
    completedWorkoutVolumeKg: 1_000,
    confidence: 'high' as const,
  };

  assert.equal(canShowDailyCommentPrediction(base), true);
  assert.equal(
    canShowDailyCommentPrediction({ ...base, measuredAt: '2026-08-01' }),
    false,
  );
  assert.equal(
    canShowDailyCommentPrediction({ ...base, recordedNutritionDays: 6 }),
    false,
  );
  assert.equal(
    canShowDailyCommentPrediction({ ...base, completedWorkoutVolumeKg: 0 }),
    false,
  );
  assert.equal(
    canShowDailyCommentPrediction({ ...base, confidence: 'medium' }),
    false,
  );
});
