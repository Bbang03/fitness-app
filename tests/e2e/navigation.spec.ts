import {
  expect,
  makeActiveWorkout,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
});

test('모바일에서 시작 팝업과 운동 조작 버튼에 접근할 수 있다', async ({ page }) => {
  await seedGuestState(page);
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
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeInViewport();
});

test('모바일에서 음식 검색 결과를 선택하고 섭취량을 조절할 수 있다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.route('**/api/mfds/search?**', async (route) => {
    await route.fulfill({ json: { foods: [] } });
  });
  await page.goto('/meals/add?date=2026-09-15&type=간식');

  const search = page.getByPlaceholder('음식 이름 또는 브랜드 검색');
  await expect(search).toBeInViewport();
  await search.fill('고구마');

  const food = page.getByRole('button', { name: /고구마/ });
  await expect(food).toBeInViewport();
  await food.click();

  const amount = page.getByRole('spinbutton', { name: /직접 입력/ });
  await amount.scrollIntoViewIfNeeded();
  await expect(amount).toBeInViewport();
  await amount.fill('180');

  const add = page.getByRole('button', { name: '이 음식 추가' });
  await add.scrollIntoViewIfNeeded();
  await expect(add).toBeInViewport();
});
