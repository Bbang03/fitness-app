import {
  expect,
  makeActiveWorkout,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

test.describe('375x667 viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('운동 footer와 조작 버튼이 접근 가능하다', async ({ page }) => {
    await mockSupabaseReads(page);
    await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
    await page.goto(`/routines/${workoutRoutine.id}/workout`);

    const complete = page.getByRole('button', { name: '1세트 완료' });
    const increase = page.getByRole('button', { name: '횟수 1 증가' }).first();
    await expect(complete).toBeInViewport();
    await increase.scrollIntoViewIfNeeded();
    await expect(increase).toBeInViewport();

    const completeBox = await complete.boundingBox();
    const increaseBox = await increase.boundingBox();
    expect(completeBox).not.toBeNull();
    expect(increaseBox).not.toBeNull();
    expect(increaseBox!.y + increaseBox!.height).toBeLessThanOrEqual(completeBox!.y);
  });
});

test.describe('430x932 viewport', () => {
  test.use({ viewport: { width: 430, height: 932 } });

  test('식단 검색과 입력 버튼이 화면 폭을 벗어나지 않는다', async ({ page }) => {
    await mockSupabaseReads(page);
    await seedGuestState(page);
    await page.route('**/api/mfds/search?**', (route) =>
      route.fulfill({ json: { foods: [] } }),
    );
    await page.goto('/meals/add?date=2026-09-15&type=간식');
    const search = page.getByPlaceholder('음식 이름 또는 브랜드 검색');
    await search.fill('고구마');
    await page.getByRole('button', { name: /고구마/ }).click();

    const amount = page.getByRole('spinbutton', { name: '직접 입력 g' });
    const add = page.getByRole('button', { name: '이 음식 추가' });
    await amount.scrollIntoViewIfNeeded();
    await expect(amount).toBeInViewport();
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeInViewport();

    for (const locator of [search, amount, add]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(430);
    }
  });
});
