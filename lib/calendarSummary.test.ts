import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCalendarDaySummaries,
} from './calendarSummary';
import type {
  MealLog,
  SetLog,
  WorkoutLog,
} from './types';

const goals = {
  kcal: 2_000,
  protein_g: 100,
};

function set(exercise_name: string, set_number: number, weight_kg = 10): SetLog {
  return {
    id: `${exercise_name}-${set_number}`,
    workout_log_id: 'workout',
    exercise_name,
    set_number,
    weight_kg,
    reps: 10,
    actual_rest_seconds: 60,
  };
}

function workout(
  date: string,
  finished_at: string | null = `${date}T10:00:00.000Z`,
): WorkoutLog {
  return {
    id: `workout-${date}-${finished_at ? 'done' : 'open'}`,
    user_id: 'user',
    routine_id: 'routine',
    routine_name: '상체 루틴',
    date,
    started_at: `${date}T09:00:00.000Z`,
    finished_at,
    sets: [set('벤치프레스', 1), set('벤치프레스', 2), set('플랭크', 1, 0)],
  };
}

function meal(date: string, kcal: number, protein_g: number): MealLog {
  return {
    id: `meal-${date}-${kcal}`,
    user_id: 'user',
    date,
    meal_type: '점심',
    items: [
      {
        id: `item-${date}-${kcal}`,
        meal_log_id: `meal-${date}-${kcal}`,
        food_name: '식사',
        serving: '1인분',
        kcal,
        carbs_g: 40,
        protein_g,
        fat_g: 10,
      },
    ],
  };
}

test('groups completed workouts and ignores unfinished logs', () => {
  const result = buildCalendarDaySummaries(
    [workout('2026-09-10'), workout('2026-09-10', null)],
    [],
    goals,
    { today: '2026-09-12' },
  );
  const summary = result.get('2026-09-10');

  assert.ok(summary);
  assert.equal(summary.completedWorkoutCount, 1);
  assert.equal(summary.totalSets, 3);
  assert.equal(summary.totalVolumeKg, 200);
  assert.deepEqual(summary.exerciseNames, ['벤치프레스', '플랭크']);
});

test('marks only recorded past days below target and exposes each deficit', () => {
  const result = buildCalendarDaySummaries(
    [],
    [meal('2026-09-10', 1_500, 50)],
    goals,
    { today: '2026-09-12' },
  );
  const summary = result.get('2026-09-10');

  assert.ok(summary);
  assert.equal(summary.mealCount, 1);
  assert.equal(summary.nutritionStatus, 'below_target');
  assert.deepEqual(summary.deficitKeys, ['kcal', 'protein']);
});

test('keeps today in progress and does not warn for an unrecorded day', () => {
  const result = buildCalendarDaySummaries(
    [],
    [meal('2026-09-12', 1, 1)],
    goals,
    { today: '2026-09-12' },
  );

  assert.equal(result.get('2026-09-12')?.nutritionStatus, 'in_progress');
  assert.equal(
    buildCalendarDaySummaries([workout('2026-09-10')], [], goals, { today: '2026-09-11' }).get(
      '2026-09-10',
    )?.nutritionStatus,
    'unrecorded',
  );
});

test('does not classify an empty meal row as recorded or below target', () => {
  const emptyMeal: MealLog = {
    ...meal('2026-09-10', 0, 0),
    items: [],
  };
  const result = buildCalendarDaySummaries(
    [],
    [emptyMeal],
    goals,
    { today: '2026-09-12' },
  );

  assert.equal(result.has('2026-09-10'), false);
});

test('reports unavailable goals without inventing a deficit', () => {
  const result = buildCalendarDaySummaries(
    [],
    [meal('2026-09-10', 1_500, 50)],
    { kcal: null, protein_g: null },
    { today: '2026-09-12' },
  );

  assert.equal(result.get('2026-09-10')?.nutritionStatus, 'goal_unavailable');
  assert.deepEqual(result.get('2026-09-10')?.deficitKeys, []);
});

test('supports one available goal and keeps future days quiet', () => {
  const result = buildCalendarDaySummaries(
    [],
    [meal('2026-09-11', 1_500, 50)],
    { kcal: null, protein_g: 100 },
    { today: '2026-09-12' },
  );

  assert.equal(result.get('2026-09-11')?.nutritionStatus, 'below_target');
  assert.deepEqual(result.get('2026-09-11')?.deficitKeys, ['protein']);
  assert.equal(
    buildCalendarDaySummaries([], [], goals, { today: '2026-09-12' }).get(
      '2026-09-13',
    ),
    undefined,
  );
});
