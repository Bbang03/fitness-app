import type { Page } from '@playwright/test';
import {
  expect,
  mockSupabaseReads,
  seedGuestState,
  test,
} from './fixtures';

type MacroCase = {
  title: string;
  query: string;
  carbs: number | null;
  fat: number | null;
  expectedCarbs: number;
  expectedFat: number;
  expectsCorrection: boolean;
};

function mfdsFood({
  id,
  name,
  servingDescription = '100g',
  carbs = 20,
  fat = 5,
}: {
  id: string;
  name: string;
  servingDescription?: string;
  carbs?: number | null;
  fat?: number | null;
}) {
  return {
    id,
    name,
    rawName: name,
    brand: 'E2E 브랜드',
    foodGroup: '테스트 식품',
    foodOrigin: 'E2E fixture',
    servingG: 100,
    servingDescription,
    per100g: {
      kcal: 200,
      carbs_g: carbs,
      protein_g: 10,
      fat_g: fat,
      sugar_g: null,
      sodium_mg: null,
      saturated_fat_g: null,
    },
    total: {
      kcal: 200,
      carbs_g: carbs,
      protein_g: 10,
      fat_g: fat,
      sugar_g: null,
      sodium_mg: null,
      saturated_fat_g: null,
    },
    macroComplete: carbs !== null && fat !== null,
    source: 'MFDS',
    researchDate: null,
    updatedDate: null,
    supplement: null,
  };
}

async function mockMfdsSearch(page: Page, food: ReturnType<typeof mfdsFood>) {
  await page.route('**/api/mfds/search?**', async (route) => {
    await route.fulfill({ json: { foods: [food] } });
  });
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
  await seedGuestState(page);
});

test('음식 검색부터 섭취량 조절과 guest 저장까지 완료한다', async ({ page }) => {
  await page.route('**/api/mfds/search?**', async (route) => {
    await route.fulfill({ json: { foods: [] } });
  });
  await page.goto('/meals/add?date=2026-09-15&type=아침');

  await page.getByPlaceholder('음식 이름 또는 브랜드 검색').fill('닭가슴살');
  const result = page.getByRole('button', { name: /닭가슴살 \(삶은\)/ });
  await expect(result).toBeVisible();
  await result.click();

  const amount = page.getByRole('spinbutton', { name: /직접 입력/ });
  await expect(amount).toHaveValue('150');
  await amount.fill('200');
  await page.getByRole('button', { name: '이 음식 추가' }).click();

  await expect(page).toHaveURL(/\/meals\?date=2026-09-15$/);
  await expect(page.getByText('닭가슴살 (삶은)', { exact: true })).toBeVisible();
  await expect(page.getByText('200g · 330kcal', { exact: true })).toBeVisible();

  const savedServing = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.mealLogs?.[0]?.items?.[0]?.serving;
  });
  expect(savedServing).toBe('200g');
});

test('음료는 mL, 고형 음식은 g 단위로 표시한다', async ({ page }) => {
  const sprite = mfdsFood({
    id: 'sprite-e2e',
    name: '스프라이트',
    servingDescription: '500mL',
    carbs: 12,
    fat: 0,
  });
  await mockMfdsSearch(page, sprite);
  await page.goto('/meals/add?date=2026-09-15&type=간식');

  const search = page.getByPlaceholder('음식 이름 또는 브랜드 검색');
  await search.fill('스프라이트');
  await page.getByRole('button', { name: /스프라이트/ }).click();
  await expect(
    page.getByRole('spinbutton', { name: '직접 입력 mL' }),
  ).toHaveAccessibleName(/mL/);

  await search.fill('고구마');
  await page.getByRole('button', { name: /고구마/ }).click();
  await expect(
    page.getByRole('spinbutton', { name: '직접 입력 g' }),
  ).toHaveAccessibleName(/g/);
});

const macroCases: MacroCase[] = [
  {
    title: '공식 탄수 값은 유지하고 누락 지방만 보정한다',
    query: '탄수공식테스트',
    carbs: 21,
    fat: null,
    expectedCarbs: 21,
    expectedFat: 7,
    expectsCorrection: true,
  },
  {
    title: '공식 지방 값은 유지하고 누락 탄수만 보정한다',
    query: '지방공식테스트',
    carbs: null,
    fat: 6,
    expectedCarbs: 31,
    expectedFat: 6,
    expectsCorrection: true,
  },
  {
    title: '탄수와 지방이 모두 없으면 두 값만 보정한다',
    query: '모두누락테스트',
    carbs: null,
    fat: null,
    expectedCarbs: 31,
    expectedFat: 7,
    expectsCorrection: true,
  },
  {
    title: '완전한 공식 영양정보는 AI 보정을 호출하지 않는다',
    query: '완전영양테스트',
    carbs: 24,
    fat: 8,
    expectedCarbs: 24,
    expectedFat: 8,
    expectsCorrection: false,
  },
];

for (const scenario of macroCases) {
  test(scenario.title, async ({ page }) => {
    const food = mfdsFood({
      id: `macro-${scenario.query}`,
      name: scenario.query,
      carbs: scenario.carbs,
      fat: scenario.fat,
    });
    let correctionCalls = 0;

    await mockMfdsSearch(page, food);
    await page.route('**/api/macro-estimate', async (route) => {
      correctionCalls += 1;
      await route.fulfill({
        json: {
          method: 'e2e-fixture',
          confidenceScore: 0.95,
          validation: {
            carbMaePer100g: null,
            fatMaePer100g: null,
            evaluated: 0,
            strategy: 'mocked',
          },
          per100g: { carbs_g: 31, fat_g: 7 },
          total: { carbs_g: 31, fat_g: 7 },
          neighbors: [],
          meta: {
            cached: true,
            model: 'e2e-fixture',
            reasoning: 'E2E deterministic correction',
          },
        },
      });
    });

    await page.goto('/meals/add?date=2026-09-15&type=점심');
    await page
      .getByPlaceholder('음식 이름 또는 브랜드 검색')
      .fill(scenario.query);

    const row = page.getByRole('article').filter({ hasText: scenario.query });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: new RegExp(scenario.query) }).click();

    await expect(row.getByText(`${scenario.expectedCarbs}g`, { exact: true })).toBeVisible();
    await expect(row.getByText(`${scenario.expectedFat}g`, { exact: true })).toBeVisible();

    if (scenario.expectsCorrection) {
      await expect(row.getByText('AI 보정', { exact: true })).toBeVisible();
      await expect(
        row.getByText(/식약처 원본 영양정보가 일부 부족해/),
      ).toBeVisible();
      expect(correctionCalls).toBe(1);
    } else {
      await expect(row.getByText('AI 보정', { exact: true })).toHaveCount(0);
      expect(correctionCalls).toBe(0);
    }
  });
}
