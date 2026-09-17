import {
  expect,
  guestUser,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

test.use({ timezoneId: 'Asia/Seoul' });

const completedWorkout = {
  id: 'history-date-query-e2e',
  user_id: guestUser.id,
  routine_id: workoutRoutine.id,
  routine_name: '날짜 링크 운동',
  date: '2026-09-15',
  started_at: '2026-09-15T09:00:00.000Z',
  finished_at: '2026-09-15T09:30:00.000Z',
  sets: [],
};

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
});

test('히스토리의 date query가 요청한 월과 선택 날짜를 초기화한다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-16T03:00:00.000Z'));
  await seedGuestState(page, { workoutLogs: [completedWorkout] });
  await page.goto('/history?date=2026-09-15');

  await expect(page.getByText('2026년 9월', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('선택한 날짜의 운동 기록', { exact: true })).toBeVisible();
  await expect(page.getByText('날짜 링크 운동', { exact: true })).toBeVisible();
});

test('한국 시간 자정 직후 InBody 측정일 max가 현지 오늘을 허용한다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-15T15:05:00.000Z'));
  await seedGuestState(page, { inbodyRecords: [] });
  await page.goto('/inbody/new');

  await expect(page.locator('input[type="date"]')).toHaveAttribute('max', '2026-09-16');
});
