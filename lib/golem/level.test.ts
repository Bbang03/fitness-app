import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildGuardianProgress } from '../guardianProgress';
import type { WorkoutLog } from '../types';
import { GOLEM_ASSET_SOURCES, GOLEM_COMBINATIONS, getGolemCombinationKey, guardianLevelToGolemLevel } from './level';

test('completed regional sets cross each visual boundary independently', () => {
  const boundaries = [[0, 0], [1, 1], [7, 1], [8, 2], [19, 2], [20, 3], [39, 3], [40, 4], [71, 4], [72, 4]];
  const exercises = { upper: '바벨 벤치프레스', lower: '바벨 백스쿼트', core: '플랭크' } as const;
  for (const region of ['upper', 'lower', 'core'] as const) {
    for (const [sets, expected] of boundaries) {
      // Separate completed workouts preserve the existing six-set per-exercise cap.
      const logs: WorkoutLog[] = Array.from({ length: sets }, (_, index) => ({
        id: `workout-${index}`, user_id: 'user', routine_id: 'routine', routine_name: '테스트',
        date: '2026-09-13', started_at: '2026-09-13T09:00:00.000Z', finished_at: '2026-09-13T10:00:00.000Z',
        sets: [{ id: `set-${index}`, workout_log_id: `workout-${index}`, exercise_name: exercises[region], set_number: 1, weight_kg: 20, reps: 10, actual_rest_seconds: 60 }],
      }));
      const progress = buildGuardianProgress(logs);
      for (const part of ['upper', 'lower', 'core'] as const) {
        assert.equal(guardianLevelToGolemLevel(progress[`${part}Level`]), part === region ? expected : 0, `${region} ${sets} sets / ${part}`);
      }
    }
  }
});

test('invalid guardian levels remain bounded and deterministic', () => {
  for (const value of [NaN, Infinity, -Infinity, -1]) assert.equal(guardianLevelToGolemLevel(value), 0);
  assert.equal(guardianLevelToGolemLevel(2.9), 2);
  assert.equal(guardianLevelToGolemLevel(5), 4);
  assert.equal(guardianLevelToGolemLevel(100), 4);
});

test('all 125 independent combinations are unique and use existing assets', () => {
  assert.equal(GOLEM_COMBINATIONS.length, 125);
  assert.equal(new Set(GOLEM_COMBINATIONS.map(getGolemCombinationKey)).size, 125);
  for (const combination of GOLEM_COMBINATIONS) {
    for (const part of ['upper', 'lower', 'core'] as const) {
      const source = GOLEM_ASSET_SOURCES[part][combination[part]];
      assert.ok(source);
      assert.ok(existsSync(join(process.cwd(), 'public', source)), source);
    }
  }
});


test('upper, lower and core each use five distinct assets', () => {
  for (const level of [0, 1, 2, 3, 4] as const) {
    assert.equal(GOLEM_ASSET_SOURCES.core[level], `/golem/core/lv${level}.png`);
    assert.equal(GOLEM_ASSET_SOURCES.upper[level], `/golem/upper/lv${level}.png`);
    assert.equal(GOLEM_ASSET_SOURCES.lower[level], `/golem/lower/lv${level}.png`);
  }
  assert.equal(new Set(Object.values(GOLEM_ASSET_SOURCES.upper)).size, 5);
  assert.equal(new Set(Object.values(GOLEM_ASSET_SOURCES.lower)).size, 5);
  assert.equal(new Set(Object.values(GOLEM_ASSET_SOURCES.core)).size, 5);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(guardianLevelToGolemLevel), [0, 1, 2, 3, 4, 4]);
});
