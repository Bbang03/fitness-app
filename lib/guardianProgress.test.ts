import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGuardianProgress } from './guardianProgress';
import type { SetLog, WorkoutLog } from './types';

function workout(exercises: string[], finished = true): WorkoutLog {
  return {
    id: crypto.randomUUID(), user_id: 'user', routine_id: 'routine', routine_name: '테스트',
    date: '2026-09-11', started_at: '2026-09-11T09:00:00.000Z',
    finished_at: finished ? '2026-09-11T10:00:00.000Z' : null,
    sets: exercises.map((exercise_name, index): SetLog => ({
      id: `set-${index}`, workout_log_id: 'workout', exercise_name, set_number: index + 1,
      weight_kg: 20, reps: 10, actual_rest_seconds: 60,
    })),
  };
}

test('empty history keeps the guardian asleep', () => {
  const result = buildGuardianProgress([]);
  assert.equal(result.balance, 'sleeping');
  assert.equal(result.totalCountedSets, 0);
});

test('unfinished workouts do not grow the guardian', () => {
  const result = buildGuardianProgress([workout(['바벨 벤치프레스'], false)]);
  assert.equal(result.upperPoints, 0);
  assert.equal(result.completedWorkouts, 0);
});

test('upper-only training makes the upper body dominant', () => {
  const result = buildGuardianProgress([workout(Array(8).fill('바벨 벤치프레스'))]);
  assert.equal(result.upperPoints, 6);
  assert.equal(result.lowerPoints, 0);
  assert.equal(result.balance, 'upper_dominant');
});

test('lower-only training makes the lower body dominant', () => {
  const result = buildGuardianProgress([workout(Array(6).fill('바벨 백스쿼트'))]);
  assert.equal(result.balance, 'lower_dominant');
  assert.equal(result.lowerPoints, 6);
});

test('balanced training recognizes comparable upper and lower records', () => {
  const result = buildGuardianProgress([
    workout(['바벨 벤치프레스', '바벨 벤치프레스', '바벨 벤치프레스', '바벨 백스쿼트', '바벨 백스쿼트', '바벨 백스쿼트']),
  ]);
  assert.equal(result.balance, 'balanced');
  assert.equal(result.balanceRatio, 100);
});

test('known core and custom cardio exercises are classified', () => {
  const result = buildGuardianProgress([workout(['플랭크', '아침 달리기'])]);
  assert.equal(result.corePoints, 1);
  assert.equal(result.cardioPoints, 1);
});

test('cardio-only training wakes the guardian', () => {
  const result = buildGuardianProgress([workout(['아침 달리기'])]);
  assert.equal(result.cardioPoints, 1);
  assert.notEqual(result.balance, 'sleeping');
});
