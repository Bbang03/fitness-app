import { buildDailyComment } from '../lib/dailyComment';
import type { InbodyRecord, MealLog, WorkoutLog } from '../lib/types';

const date = '2026-09-14';

const meals: MealLog[] = [
  {
    id: 'demo-meal',
    user_id: 'demo-user',
    date,
    meal_type: '저녁',
    items: [
      {
        id: 'demo-item',
        meal_log_id: 'demo-meal',
        food_name: '닭가슴살 정식',
        serving: '1인분',
        kcal: 1_800,
        carbs_g: 210,
        protein_g: 72,
        fat_g: 48,
      },
    ],
  },
];

const workouts: WorkoutLog[] = [
  {
    id: 'demo-workout',
    user_id: 'demo-user',
    routine_id: 'demo-routine',
    routine_name: '상체 루틴',
    date,
    started_at: `${date}T09:00:00.000Z`,
    finished_at: `${date}T10:00:00.000Z`,
    sets: [
      {
        id: 'demo-set-1',
        workout_log_id: 'demo-workout',
        exercise_name: '벤치프레스',
        set_number: 1,
        weight_kg: 60,
        reps: 8,
        actual_rest_seconds: 90,
        record_type: 'weight_reps',
      },
      {
        id: 'demo-set-2',
        workout_log_id: 'demo-workout',
        exercise_name: '벤치프레스',
        set_number: 2,
        weight_kg: 60,
        reps: 8,
        actual_rest_seconds: 90,
        record_type: 'weight_reps',
      },
      {
        id: 'demo-set-3',
        workout_log_id: 'demo-workout',
        exercise_name: '벤치프레스',
        set_number: 3,
        weight_kg: 60,
        reps: 8,
        actual_rest_seconds: 90,
        record_type: 'weight_reps',
      },
    ],
  },
];

const measured: InbodyRecord = {
  id: 'demo-inbody',
  user_id: 'demo-user',
  measured_at: '2026-09-01',
  weight_kg: 70,
  skeletal_muscle_kg: 32,
  body_fat_kg: 14,
  body_fat_pct: 20,
};

const report = buildDailyComment({
  date,
  mealLogs: meals,
  workoutLogs: workouts,
  targets: {
    kcal: 2_000,
    protein_g: 120,
  },
  latestMeasuredBodyComposition: measured,
  prediction: {
    horizonDays: 30,
    predictedWeightKg: 69.7,
    predictedSkeletalMuscleKg: 32.2,
    predictedBodyFatKg: 13.7,
    predictedBodyFatPct: 19.7,
    confidence: 'medium',
    modelVersion: 'baseline-v1',
  },
});

console.log('오늘의 총평');
console.log(report.comment);
console.log(`다음 행동: ${report.nextAction}`);
console.log('근거');
for (const item of report.evidence) {
  console.log(`- ${item.label}: ${item.detail}`);
}
console.log('체성분');
console.log(report.bodyComposition.note ?? '비교 가능한 체성분 정보가 없습니다.');

