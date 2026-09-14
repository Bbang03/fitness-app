import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGuardianProgress } from '../guardianProgress';
import type { WorkoutLog } from '../types';
import { applyGolemVisualDecay, getGolemLastActivity } from './decay';
import { guardianLevelToGolemLevel } from './level';
import type { GolemCombination } from './types';

const now = new Date(2026, 8, 13, 12);
const base: GolemCombination = { upper: 4, lower: 3, core: 2 };
function ago(days: number, hour = 12) {
  return new Date(2026, 8, 13 - days, hour).toISOString();
}
function workout(exercises: string[], completedAt: string | null): WorkoutLog {
  return {
    id: 'workout', user_id: 'user', routine_id: 'routine', routine_name: '테스트',
    date: '2026-09-01', started_at: ago(12), finished_at: completedAt,
    sets: exercises.map((exercise_name, index) => ({
      id: `set-${index}`, workout_log_id: 'workout', exercise_name, set_number: index + 1,
      weight_kg: 20, reps: 10, actual_rest_seconds: 60,
    })),
  };
}
const upper = '바벨 벤치프레스';
const lower = '바벨 백스쿼트';
const core = '플랭크';
function displayed(logs: WorkoutLog[], levels = base) {
  return applyGolemVisualDecay(levels, getGolemLastActivity(logs, now), now);
}

test('today through five calendar days ago keeps base visual levels', () => {
  for (const days of [0, 1, 5]) {
    // Five calendar days still holds even if more than 120 hours have elapsed.
    assert.deepEqual(displayed([workout([upper, lower, core], ago(days, 0))]), base);
  }
});

test('six calendar days ago decays exactly one step, including before 144 elapsed hours', () => {
  for (const days of [6, 7, 100]) {
    assert.deepEqual(displayed([workout([upper, lower, core], ago(days, 23))]), { upper: 3, lower: 2, core: 1 });
  }
});

test('visual level zero never becomes negative', () => {
  const zero: GolemCombination = { upper: 0, lower: 0, core: 0 };
  assert.deepEqual(displayed([workout([upper, lower, core], ago(100))], zero), zero);
});

test('upper, lower and core activity are independent and latest dates ignore input order', () => {
  const logs = [workout([upper], ago(7)), workout([lower], ago(5)), workout([core], ago(6)), workout([lower], ago(50))];
  assert.deepEqual(displayed(logs), { upper: 3, lower: 3, core: 1 });
  assert.deepEqual(displayed([...logs].reverse()), { upper: 3, lower: 3, core: 1 });
});

test('completing each region again immediately restores its unchanged base level', () => {
  const old = workout([upper, lower, core], ago(7));
  for (const [part, exercise] of [['upper', upper], ['lower', lower], ['core', core]] as const) {
    const expected = { upper: 3, lower: 2, core: 1 };
    expected[part] = base[part];
    assert.deepEqual(displayed([old, workout([exercise], ago(0))]), expected);
  }
});

test('unfinished workouts do not reset activity even with recent start/date', () => {
  const unfinished = { ...workout([upper, lower, core], null), date: '2026-09-13', started_at: ago(0) };
  assert.deepEqual(displayed([workout([upper, lower, core], ago(7)), unfinished]), { upper: 3, lower: 2, core: 1 });
});

test('cardio, unknown exercises, empty workouts and invalid/future completions cannot restore a region', () => {
  const old = workout([upper, lower, core], ago(7));
  const ignored = [workout(['아침 달리기', '알 수 없는 운동'], ago(0)), workout([], ago(0)), workout([upper, lower, core], 'invalid'), workout([upper, lower, core], ago(-1))];
  assert.deepEqual(displayed([old, ...ignored]), { upper: 3, lower: 2, core: 1 });
  assert.deepEqual(displayed(ignored), base);
});

test('completion time rather than start/date restores an overnight workout', () => {
  assert.deepEqual(displayed([workout([upper, lower, core], ago(0))]), base);
});

test('decay does not mutate input logs, base levels or cumulative Guardian progress', () => {
  const logs = [workout([upper, lower, core], ago(7))];
  const before = JSON.stringify(logs);
  const progress = buildGuardianProgress(logs);
  const levels = Object.freeze({
    upper: guardianLevelToGolemLevel(progress.upperLevel),
    lower: guardianLevelToGolemLevel(progress.lowerLevel),
    core: guardianLevelToGolemLevel(progress.coreLevel),
  });
  assert.deepEqual(displayed(logs, levels), { upper: 0, lower: 0, core: 0 });
  assert.deepEqual(levels, { upper: 1, lower: 1, core: 1 });
  assert.deepEqual(buildGuardianProgress(logs), progress);
  assert.equal(JSON.stringify(logs), before);
});

test('missing activity or an invalid clock preserves growth rather than inventing inactivity', () => {
  assert.deepEqual(displayed([]), base);
  const invalid = new Date(NaN);
  assert.deepEqual(applyGolemVisualDecay(base, getGolemLastActivity([workout([upper], ago(7))], now), invalid), base);
  assert.deepEqual(getGolemLastActivity([workout([upper], ago(7))], invalid), { upper: null, lower: null, core: null });
});
