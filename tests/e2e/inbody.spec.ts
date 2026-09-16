import {
  expect,
  mockSupabaseReads,
  seedGuestState,
  test,
} from './fixtures';

async function fillRequiredFields(
  page: import('@playwright/test').Page,
  values = {
    weight: '70',
    skeletal: '32',
    fatKg: '14',
    fatPct: '20',
  },
) {
  await page.getByPlaceholder('예: 72.5').fill(values.weight);
  await page.getByPlaceholder('예: 34.2').fill(values.skeletal);
  await page.getByPlaceholder('예: 12.3').fill(values.fatKg);
  await page.getByPlaceholder('예: 18.4').fill(values.fatPct);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
  await seedGuestState(page, { inbodyRecords: [] });
  await page.goto('/inbody/new');
});

test('필수 체성분 값과 선택 값을 guest 기록으로 저장한다', async ({ page }) => {
  await page.goto('/inbody');
  await page.getByRole('link', { name: '기록 추가', exact: true }).click();
  await page.locator('input[type="date"]').fill('2026-09-15');
  await fillRequiredFields(page);
  await page.getByPlaceholder('예: 1680').fill('1650');
  await page.getByRole('button', { name: '체성분 기록 저장' }).click();

  await expect(page).toHaveURL(/\/inbody$/);
  const record = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.inbodyRecords?.[0];
  });
  expect(record).toMatchObject({
    measured_at: '2026-09-15',
    weight_kg: 70,
    skeletal_muscle_kg: 32,
    body_fat_kg: 14,
    body_fat_pct: 20,
    bmr_kcal: 1650,
  });
});

test('필수 값 누락 시 저장하지 않고 안내한다', async ({ page }) => {
  await page.locator('input[type="date"]').fill('2026-09-15');
  await page.getByRole('button', { name: '체성분 기록 저장' }).click();

  await expect(
    page.getByText('체중, 골격근량, 체지방량, 체지방률은 필수 항목입니다.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/inbody\/new$/);
});

test('범위를 벗어난 체중을 저장하지 않는다', async ({ page }) => {
  await page.locator('input[type="date"]').fill('2026-09-15');
  await fillRequiredFields(page, {
    weight: '20',
    skeletal: '10',
    fatKg: '4',
    fatPct: '20',
  });
  await page.getByRole('button', { name: '체성분 기록 저장' }).click();

  await expect(page.getByText('체중이 올바르지 않습니다.')).toBeVisible();
});

test('체지방량과 체지방률이 크게 불일치하면 저장을 차단한다', async ({ page }) => {
  await page.locator('input[type="date"]').fill('2026-09-15');
  await fillRequiredFields(page, {
    weight: '70',
    skeletal: '30',
    fatKg: '30',
    fatPct: '10',
  });
  await page.getByRole('button', { name: '체성분 기록 저장' }).click();

  await expect(
    page.getByText(/체지방량과 체지방률의 관계가 크게 차이납니다/),
  ).toBeVisible();
});
