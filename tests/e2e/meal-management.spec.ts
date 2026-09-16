import {
  expect,
  guestUser,
  mockSupabaseReads,
  seedGuestState,
  test,
} from './fixtures';

const mealLog = {
  id: 'meal-log-e2e',
  user_id: guestUser.id,
  date: '2026-09-15',
  meal_type: '점심' as const,
  items: [
    {
      id: 'meal-item-e2e',
      meal_log_id: 'meal-log-e2e',
      food_name: '현미밥',
      serving: '100g',
      grams: 100,
      kcal: 150,
      carbs_g: 32,
      protein_g: 3,
      fat_g: 1,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
});

test('직접 입력한 음식과 영양 정보를 guest 식단에 저장한다', async ({ page }) => {
  await seedGuestState(page, { mealLogs: [] });
  await page.goto('/meals/add?date=2026-09-15&type=점심');
  await page.getByRole('button', { name: '직접 입력', exact: true }).click();

  await page.getByLabel('음식 이름 *').fill('수제 샌드위치');
  await page.getByLabel('섭취량 (g)').fill('180');
  await page.getByLabel('제공량 메모 (선택)').fill('1개');
  await page.getByLabel(/칼로리/).fill('420');
  await page.getByLabel(/탄수화물/).fill('48');
  await page.getByLabel(/단백질/).fill('24');
  await page.getByLabel(/지방/).fill('14');
  const add = page.getByRole('button', { name: '식사에 추가' });
  await expect(add).toBeEnabled();
  await expect(page.getByLabel(/지방/)).toHaveValue('14');
  await add.click();

  await expect(page).toHaveURL(/\/meals\?date=2026-09-15$/, {
    timeout: 15_000,
  });
  await expect(page.getByText('수제 샌드위치', { exact: true })).toBeVisible();
  await expect(page.getByText('1개 (180g) · 420kcal', { exact: true })).toBeVisible();
});

test('수동 입력 초안은 reload 후 복구되고 저장 후 제거된다', async ({ page }) => {
  await seedGuestState(page, { mealLogs: [] });
  await page.goto('/meals/add?date=2026-09-15&type=간식');
  await page.getByRole('button', { name: '직접 입력', exact: true }).click();
  await page.getByLabel('음식 이름 *').fill('초안 요거트');
  await page.getByLabel('섭취량 (g)').fill('120');
  await page.getByLabel(/칼로리/).fill('95');

  await page.reload();
  await page.getByRole('button', { name: '직접 입력', exact: true }).click();
  await expect(page.getByLabel('음식 이름 *')).toHaveValue('초안 요거트');
  await expect(page.getByLabel('섭취량 (g)')).toHaveValue('120');
  await page.getByRole('button', { name: '식사에 추가' }).click();

  const draftKeys = await page.evaluate(() =>
    Object.keys(sessionStorage).filter((key) => key.includes('meal')),
  );
  expect(draftKeys).toHaveLength(0);
});

test('기존 식단의 섭취량 수정 시 영양 값도 비례 조정한다', async ({ page }) => {
  await seedGuestState(page, { mealLogs: [mealLog] });
  await page.goto('/meals?date=2026-09-15');
  await page.getByRole('button', { name: '음식 수정' }).click();

  await page.getByLabel('섭취량 (g)').fill('200');
  await page.getByRole('button', { name: '수정 저장' }).click();

  await expect(page.getByText('200g · 300kcal', { exact: true })).toBeVisible();
  await expect(page.getByText('탄 64g', { exact: true })).toBeVisible();
});

test('마지막 음식을 삭제하면 빈 meal log도 함께 정리한다', async ({ page }) => {
  await seedGuestState(page, { mealLogs: [mealLog] });
  await page.goto('/meals?date=2026-09-15');
  await page.getByRole('button', { name: '음식 삭제' }).click();

  await expect(page.getByText('현미밥', { exact: true })).toHaveCount(0);
  const logs = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.mealLogs ?? [];
  });
  expect(logs).toHaveLength(0);
});
