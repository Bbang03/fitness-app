import {
  expect,
  guestUser,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

const completedWorkout = {
  id: 'completed-workout-e2e',
  user_id: guestUser.id,
  routine_id: workoutRoutine.id,
  routine_name: '완료한 전신 루틴',
  date: '2026-09-15',
  started_at: '2026-09-15T09:00:00.000Z',
  finished_at: '2026-09-15T09:30:00.000Z',
  sets: [
    {
      id: 'history-set-1',
      workout_log_id: 'completed-workout-e2e',
      exercise_name: '스쿼트',
      set_number: 1,
      weight_kg: 50,
      reps: 10,
      actual_rest_seconds: 60,
      record_type: 'weight_reps' as const,
    },
    {
      id: 'history-set-2',
      workout_log_id: 'completed-workout-e2e',
      exercise_name: '스쿼트',
      set_number: 2,
      weight_kg: 50,
      reps: 10,
      actual_rest_seconds: 60,
      record_type: 'weight_reps' as const,
    },
  ],
};

const todayMeal = {
  id: 'dashboard-meal-e2e',
  user_id: guestUser.id,
  date: '2026-09-16',
  meal_type: '아침' as const,
  items: [
    {
      id: 'dashboard-food-e2e',
      meal_log_id: 'dashboard-meal-e2e',
      food_name: '대시보드 테스트 식사',
      serving: '1회',
      grams: 100,
      kcal: 510,
      carbs_g: 60,
      protein_g: 35,
      fat_g: 14,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-16T03:00:00.000Z'));
  await mockSupabaseReads(page);
});

test('대시보드는 오늘 식단 합계와 macro를 저장 상태에서 집계한다', async ({ page }) => {
  await seedGuestState(page, { mealLogs: [todayMeal] });
  await page.goto('/dashboard');

  const nutrition = page.getByRole('region', { name: '오늘의 식단과 섭취량' });
  await expect(nutrition.getByText(/510/)).toBeVisible();
  await expect(nutrition.getByText('60g', { exact: true })).toBeVisible();
  await expect(nutrition.getByText('35g', { exact: true })).toBeVisible();
  await expect(nutrition.getByText('14g', { exact: true })).toBeVisible();
});

test('운동 기록 화면은 완료 기록의 월간 횟수·세트·볼륨을 집계한다', async ({ page }) => {
  await seedGuestState(page, { workoutLogs: [completedWorkout] });
  await page.goto('/history');

  await expect(page.getByRole('heading', { name: '운동 기록' })).toBeVisible();
  await expect(page.getByText('완료한 전신 루틴', { exact: true })).toBeVisible();
  await expect(page.getByText('2세트', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1,000kg', { exact: true }).first()).toBeVisible();
});

test('달력 날짜를 선택하면 그 날짜의 상세 운동 기록을 표시한다', async ({ page }) => {
  await seedGuestState(page, { workoutLogs: [completedWorkout] });
  await page.goto('/history');

  await page.getByRole('button', { name: '15', exact: true }).click();
  await expect(page.getByText('선택한 날짜의 운동 기록')).toBeVisible();
  await expect(page.getByText('완료한 전신 루틴', { exact: true })).toBeVisible();
  await expect(page.getByText('스쿼트', { exact: true })).toBeVisible();
});
