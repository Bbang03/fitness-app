import type { Page } from '@playwright/test';
import {
  expect,
  mockSupabaseReads,
  seedGuestState,
  test,
} from './fixtures';

type NutritionValue = number | null;

function foodFixture(
  name: string,
  values: {
    kcal: NutritionValue;
    carbs: NutritionValue;
    protein: NutritionValue;
    fat: NutritionValue;
    sugar?: NutritionValue;
    saturatedFat?: NutritionValue;
    serving?: string;
  },
) {
  const nutrition = {
    kcal: values.kcal,
    carbs_g: values.carbs,
    protein_g: values.protein,
    fat_g: values.fat,
    sugar_g: values.sugar ?? null,
    sodium_mg: null,
    saturated_fat_g: values.saturatedFat ?? null,
  };

  return {
    id: `stress-${name}`,
    name,
    rawName: name,
    brand: 'E2E 스트레스',
    foodGroup: '테스트 식품',
    foodOrigin: 'E2E fixture',
    servingG: 100,
    servingDescription: values.serving ?? '100g',
    per100g: nutrition,
    total: nutrition,
    macroComplete:
      values.kcal !== null &&
      values.carbs !== null &&
      values.protein !== null &&
      values.fat !== null,
    source: 'MFDS',
    researchDate: null,
    updatedDate: null,
    supplement: null,
  };
}

async function assertNoInvalidNumbers(page: Page) {
  await expect(page.getByText(/NaN|Infinity|-Infinity/)).toHaveCount(0);
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
  await seedGuestState(page);
});

test('섭취량 경계값을 연속 변경해도 잘못된 영양 숫자가 표시되지 않는다', async ({ page }) => {
  await page.route('**/api/mfds/search?**', (route) =>
    route.fulfill({ json: { foods: [] } }),
  );
  await page.goto('/meals/add?date=2026-09-15&type=간식');
  await page.getByPlaceholder('음식 이름 또는 브랜드 검색').fill('고구마');

  const row = page.getByRole('article').filter({ hasText: '고구마' });
  await row.getByRole('button', { name: /고구마/ }).click();
  const amount = row.getByRole('spinbutton', { name: '직접 입력 g' });

  for (const boundary of ['0', '-1', '0.1', '1', '100', '200', '10000']) {
    await amount.fill(boundary);
    await expect(amount).toHaveValue(boundary);
    await assertNoInvalidNumbers(page);
  }
});

test('음료와 고형 음식 단위를 3회 왕복해도 각 행의 단위가 유지된다', async ({ page }) => {
  const drink = foodFixture('스트레스 음료', {
    kcal: 90,
    carbs: 22,
    protein: 0,
    fat: 0,
    serving: '250mL',
  });
  await page.route('**/api/mfds/search?**', (route) =>
    route.fulfill({ json: { foods: [drink] } }),
  );
  await page.goto('/meals/add?date=2026-09-15&type=간식');

  const search = page.getByPlaceholder('음식 이름 또는 브랜드 검색');

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await search.fill('스트레스 음료');
    const drinkRow = page.getByRole('article').filter({ hasText: '스트레스 음료' });
    await drinkRow.getByRole('button', { name: /스트레스 음료/ }).click();
    await expect(
      drinkRow.getByRole('spinbutton', { name: '직접 입력 mL' }),
    ).toBeVisible();
    await drinkRow.getByRole('button', { name: /스트레스 음료/ }).click();

    await search.fill('고구마');
    const solidRow = page.getByRole('article').filter({ hasText: '고구마' });
    await solidRow.getByRole('button', { name: /고구마/ }).click();
    await expect(
      solidRow.getByRole('spinbutton', { name: '직접 입력 g' }),
    ).toBeVisible();
    await solidRow.getByRole('button', { name: /고구마/ }).click();
  }
});

test('AI 보정 불가 조합과 0·매우 작은 공식값을 안전하게 표시한다', async ({ page }) => {
  const fixtures = new Map([
    ['단백질만테스트', foodFixture('단백질만테스트', {
      kcal: null, carbs: null, protein: 12, fat: null, sugar: 0,
    })],
    ['열량만테스트', foodFixture('열량만테스트', {
      kcal: 100, carbs: null, protein: null, fat: null, saturatedFat: 0,
    })],
    ['매크로없음테스트', foodFixture('매크로없음테스트', {
      kcal: null, carbs: null, protein: null, fat: null,
    })],
    ['영점테스트', foodFixture('영점테스트', {
      kcal: 0, carbs: 0, protein: 0, fat: 0, sugar: 0, saturatedFat: 0,
    })],
    ['극소값테스트', foodFixture('극소값테스트', {
      kcal: 1, carbs: 0.1, protein: 0.1, fat: 0.1,
    })],
  ]);
  let aiCalls = 0;

  await page.route('**/api/mfds/search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    await route.fulfill({ json: { foods: [fixtures.get(query)] } });
  });
  await page.route('**/api/macro-estimate', async (route) => {
    aiCalls += 1;
    await route.fulfill({ status: 500, json: { message: 'unexpected call' } });
  });
  await page.goto('/meals/add?date=2026-09-15&type=점심');

  const search = page.getByPlaceholder('음식 이름 또는 브랜드 검색');
  for (const query of fixtures.keys()) {
    await search.fill(query);
    const row = page.getByRole('article').filter({ hasText: query });
    await row.getByRole('button', { name: new RegExp(query) }).click();
    await assertNoInvalidNumbers(page);

    if (query.includes('만테스트') || query.includes('없음테스트')) {
      await expect(row.getByText('일부 영양정보를 직접 입력해주세요')).toBeVisible();
    }

    await row.getByRole('button', { name: new RegExp(query) }).click();
  }

  expect(aiCalls).toBe(0);
});

test('AI가 비정상 숫자를 응답해도 NaN이나 Infinity를 표시하지 않는다', async ({ page }) => {
  const incomplete = foodFixture('AI이상응답테스트', {
    kcal: 200,
    carbs: null,
    protein: 10,
    fat: null,
  });
  await page.route('**/api/mfds/search?**', (route) =>
    route.fulfill({ json: { foods: [incomplete] } }),
  );
  await page.route('**/api/macro-estimate', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        method: 'malformed-e2e',
        confidenceScore: 0.9,
        validation: {},
        per100g: { carbs_g: 'not-a-number', fat_g: 1e300 },
        total: { carbs_g: 'not-a-number', fat_g: 1e300 },
        neighbors: [],
      }),
    }),
  );
  await page.goto('/meals/add?date=2026-09-15&type=점심');
  await page
    .getByPlaceholder('음식 이름 또는 브랜드 검색')
    .fill('AI이상응답테스트');

  const row = page.getByRole('article').filter({ hasText: 'AI이상응답테스트' });
  await row.getByRole('button', { name: /AI이상응답테스트/ }).click();
  await expect(row.getByText('자동 보정이 어려워 직접 입력이 필요해요')).toBeVisible();
  await assertNoInvalidNumbers(page);
});

test('검색 API의 지연·500·빈 결과·깨진 JSON에도 화면이 유지된다', async ({ page }) => {
  const slowFood = foodFixture('느린응답테스트', {
    kcal: 100, carbs: 20, protein: 5, fat: 2,
  });
  await page.route('**/rest/v1/rpc/search_brand_foods**', (route) =>
    route.fulfill({ status: 500, json: { message: 'mocked failure' } }),
  );
  await page.route('**/api/mfds/search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');

    if (query === '오백오류') {
      await route.fulfill({ status: 500, json: { message: 'mocked failure' } });
      return;
    }
    if (query === '깨진응답') {
      await route.fulfill({ contentType: 'application/json', body: '{"foods":' });
      return;
    }
    if (query === '느린응답테스트') {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ json: { foods: [slowFood] } });
      return;
    }

    await route.fulfill({ json: { foods: [] } });
  });
  await page.goto('/meals/add?date=2026-09-15&type=점심');
  const search = page.getByPlaceholder('음식 이름 또는 브랜드 검색');

  for (const query of ['오백오류', '빈결과', '깨진응답']) {
    await search.fill(query);
    await expect(page.getByText(new RegExp(`${query}.*검색 결과가 없어요`))).toBeVisible();
    await assertNoInvalidNumbers(page);
  }

  await search.fill('느린응답테스트');
  await expect(page.getByText(/검색 중/).first()).toBeVisible();
  await expect(
    page.getByRole('article').filter({ hasText: '느린응답테스트' }),
  ).toBeVisible();
  await assertNoInvalidNumbers(page);
});
