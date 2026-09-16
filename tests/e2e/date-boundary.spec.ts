import type { Page } from '@playwright/test';
import {
  expect,
  makeActiveWorkout,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

async function saveLocalFood(page: Page) {
  await page.route('**/api/mfds/search?**', async (route) => {
    await route.fulfill({ json: { foods: [] } });
  });
  await page
    .getByPlaceholder('음식 이름 또는 브랜드 검색')
    .fill('고구마');
  await page.getByRole('button', { name: /고구마/ }).click();
  await page.getByRole('button', { name: '이 음식 추가' }).click();
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
});

test('연말에 선택한 12월 31일 식단은 날짜가 바뀌지 않는다', async ({ page }) => {
  await seedGuestState(page);
  await page.goto('/meals/add?date=2026-12-31&type=저녁');
  await saveLocalFood(page);

  await expect(page).toHaveURL(/\/meals\?date=2026-12-31$/);
  const savedDate = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.mealLogs?.[0]?.date;
  });
  expect(savedDate).toBe('2026-12-31');
});

test('한국 시간 자정 직후 완료한 운동은 새해 날짜로 저장한다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-31T15:05:00.000Z'));
  await seedGuestState(page, {
    activeWorkout: makeActiveWorkout({
      phase: 'complete',
      completedSets: [
        {
          id: 'new-year-set-e2e',
          workout_log_id: 'workout-e2e',
          exercise_name: workoutRoutine.items[0].exercise_name,
          set_number: 1,
          weight_kg: 40,
          reps: 8,
          actual_rest_seconds: 0,
          record_type: 'weight_reps',
        },
      ],
    }),
  });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);
  await page.getByRole('button', { name: '운동 기록 저장' }).click();

  const savedDate = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.workoutLogs?.[0]?.date;
  });
  expect(savedDate).toBe('2027-01-01');
});

test('유효하지 않은 식단 날짜 query는 오늘 날짜로 복구한다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-31T15:05:00.000Z'));
  await seedGuestState(page);
  await page.goto('/meals/add?date=2026-02-30&type=간식');
  await saveLocalFood(page);

  await expect(page).toHaveURL(/\/meals\?date=2027-01-01$/);
  const savedDate = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.mealLogs?.[0]?.date;
  });
  expect(savedDate).toBe('2027-01-01');
});
