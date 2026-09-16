import {
  expect,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
  await seedGuestState(page);
});

test('WebKit 모바일에서 루틴을 시작하고 첫 세트를 조작한다', async ({ page }) => {
  await page.goto('/routines');
  await page
    .getByRole('button', { name: `${workoutRoutine.name} 운동 시작` })
    .click();

  const start = page.getByRole('button', { name: '운동 시작', exact: true });
  await expect(start).toBeInViewport();
  await start.click();

  const increase = page.getByRole('button', { name: '횟수 1 증가' }).first();
  const complete = page.getByRole('button', { name: '1세트 완료' });
  await expect(increase).toBeInViewport();
  await expect(complete).toBeInViewport();
  await increase.click();
  await complete.click();
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();
});

test('WebKit 모바일에서 음식을 검색하고 guest 식단을 저장한다', async ({ page }) => {
  await page.route('**/api/mfds/search?**', async (route) => {
    await route.fulfill({ json: { foods: [] } });
  });
  await page.goto('/meals/add?date=2026-09-15&type=간식');

  const search = page.getByPlaceholder('음식 이름 또는 브랜드 검색');
  await expect(search).toBeInViewport();
  await search.fill('고구마');
  await page.getByRole('button', { name: /고구마/ }).click();

  const amount = page.getByRole('spinbutton', { name: /직접 입력/ });
  await amount.scrollIntoViewIfNeeded();
  await amount.fill('180');

  const save = page.getByRole('button', { name: '이 음식 추가' });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await save.click();

  await expect(page).toHaveURL(/\/meals\?date=2026-09-15$/);
  await expect(page.getByText('180g · 155kcal', { exact: true })).toBeVisible();
});
