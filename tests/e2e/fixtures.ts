import { expect, test as base, type Page } from '@playwright/test';

export const guestUser = {
  id: 'guest-e2e',
  email: '',
  password: '',
  name: 'E2E 게스트',
  height_cm: 170,
  sex: 'male' as const,
  birth_year: 1995,
  created_at: '2026-01-01T00:00:00.000Z',
  is_guest: true,
};

export const workoutRoutine = {
  id: 'routine-e2e',
  user_id: guestUser.id,
  name: '전신 루틴',
  created_at: '2026-01-01T00:00:00.000Z',
  items: [
    {
      id: 'routine-item-squat',
      order: 0,
      exercise_name: '스쿼트',
      target_sets: 2,
      target_reps: 8,
      target_weight_kg: 40,
      set_targets: [
        { weight_kg: 40, reps: 8, duration_seconds: 0 },
        { weight_kg: 40, reps: 8, duration_seconds: 0 },
      ],
      rest_seconds: 75,
      record_type: 'weight_reps' as const,
      superset_group: null,
    },
    {
      id: 'routine-item-pushup',
      order: 1,
      exercise_name: '푸시업',
      target_sets: 1,
      target_reps: 12,
      target_weight_kg: 0,
      set_targets: [
        { weight_kg: 0, reps: 12, duration_seconds: 0 },
      ],
      rest_seconds: 60,
      record_type: 'reps_only' as const,
      superset_group: null,
    },
  ],
};

export type ActiveWorkoutFixture = {
  workoutLogId: string;
  routineId: string;
  routineName: string;
  startedAt: string;
  exercises: typeof workoutRoutine.items;
  phase: 'exercise' | 'complete';
  currentExerciseIndex: number;
  currentSetIndex: number;
  completedSets: Array<{
    id: string;
    workout_log_id: string;
    exercise_name: string;
    set_number: number;
    weight_kg: number;
    reps: number;
    actual_rest_seconds: number;
    record_type: 'weight_reps' | 'reps_only';
  }>;
  restTimer: { endTimestamp: number; totalSeconds: number } | null;
};

export function makeActiveWorkout(
  overrides: Partial<ActiveWorkoutFixture> = {},
): ActiveWorkoutFixture {
  return {
    workoutLogId: 'workout-e2e',
    routineId: workoutRoutine.id,
    routineName: workoutRoutine.name,
    startedAt: '2026-09-15T00:00:00.000Z',
    exercises: workoutRoutine.items,
    phase: 'exercise',
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    completedSets: [],
    restTimer: null,
    ...overrides,
  };
}

type StoreSeed = {
  users: typeof guestUser[];
  currentUserId: string;
  routines: typeof workoutRoutine[];
  workoutLogs: unknown[];
  activeWorkout: ActiveWorkoutFixture | null;
  mealLogs: unknown[];
  inbodyRecords: unknown[];
  favoriteExerciseIds: string[];
};

export async function seedGuestState(
  page: Page,
  overrides: Partial<StoreSeed> = {},
) {
  const state: StoreSeed = {
    users: [guestUser],
    currentUserId: guestUser.id,
    routines: [workoutRoutine],
    workoutLogs: [],
    activeWorkout: null,
    mealLogs: [],
    inbodyRecords: [],
    favoriteExerciseIds: [],
    ...overrides,
  };

  await page.addInitScript((seed) => {
    sessionStorage.setItem('chagok-intro-seen', '1');

    if (!localStorage.getItem('fittrack-store')) {
      localStorage.setItem(
        'fittrack-store',
        JSON.stringify({ state: seed, version: 0 }),
      );
    }
  }, state);
}

export async function mockSupabaseReads(page: Page) {
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'No test session' }),
    });
  });

  await page.route('**/rest/v1/rpc/search_brand_foods**', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('**/rest/v1/brand_foods**', async (route) => {
    await route.fulfill({ json: [] });
  });
}

export const test = base;
export { expect };
