import type { Locator, Page } from '@playwright/test';
import {
  expect,
  guestUser,
  makeActiveWorkout,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

async function chooseLocalFood(page: Page) {
  await page.route('**/api/mfds/search?**', async (route) => {
    await route.fulfill({ json: { foods: [] } });
  });

  await page
    .getByPlaceholder('음식 이름 또는 브랜드 검색')
    .fill('고구마');
  await page.getByRole('button', { name: /고구마/ }).click();
}

async function dispatchRapidClicks(
  locator: Locator,
  count: number,
) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element, clickCount) => {
    for (let index = 0; index < clickCount; index += 1) {
      (element as HTMLElement).click();
    }
  }, count);
}

test('식단 저장 버튼을 연타해도 한 항목만 저장한다', async ({ page }) => {
  await mockSupabaseReads(page);
  await seedGuestState(page);
  await page.goto('/meals/add?date=2026-09-15&type=간식');
  await chooseLocalFood(page);

  const save = page.getByRole('button', { name: '이 음식 추가' });
  await expect(save).toBeEnabled();
  await dispatchRapidClicks(save, 5);

  await expect(page).toHaveURL(/\/meals\?date=2026-09-15$/);
  const savedItems = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.mealLogs?.flatMap(
      (log: { items?: unknown[] }) => log.items ?? [],
    ) ?? [];
  });
  expect(savedItems).toHaveLength(1);
});

test('운동 기록 저장 버튼을 연타해도 한 기록만 저장한다', async ({ page }) => {
  await mockSupabaseReads(page);
  await seedGuestState(page, {
    activeWorkout: makeActiveWorkout({
      phase: 'complete',
      completedSets: [
        {
          id: 'completed-set-e2e',
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

  const save = page.getByRole('button', { name: '운동 기록 저장' });
  await expect(save).toBeEnabled();
  await dispatchRapidClicks(save, 5);

  await expect(page).toHaveURL(/\/dashboard$/);
  const workoutLogs = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.workoutLogs ?? [];
  });
  expect(workoutLogs).toHaveLength(1);
});

test('깨진 localStorage JSON이 있어도 로그인 화면으로 복구한다', async ({ page }) => {
  await mockSupabaseReads(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    sessionStorage.setItem('chagok-intro-seen', '1');
    localStorage.setItem('fittrack-store', '{broken-json');
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  expect(pageErrors).toEqual([]);
});

test('persist 배열 타입이 손상되어도 로그인 화면으로 안전하게 복구한다', async ({ page }) => {
  await mockSupabaseReads(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    sessionStorage.setItem('chagok-intro-seen', '1');
    localStorage.setItem(
      'fittrack-store',
      JSON.stringify({
        state: {
          users: null,
          currentUserId: 'missing-user',
          routines: {},
          workoutLogs: 'invalid',
          mealLogs: null,
          inbodyRecords: 1,
          favoriteExerciseIds: false,
          activeWorkout: { routineId: 'missing-routine' },
        },
        version: 0,
      }),
    );
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  expect(pageErrors).toEqual([]);

  const state = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state;
  });
  expect(state.users).toEqual([]);
  expect(state.routines).toEqual([]);
  expect(state.activeWorkout).toBeNull();
});

test('원격 식단 저장 실패 후 재시도하면 한 번만 반영한다', async ({ page }) => {
  const member = {
    ...guestUser,
    id: 'member-e2e',
    email: 'member-e2e@example.test',
    name: 'E2E 회원',
    is_guest: false,
  };
  let mealLogWrites = 0;
  let mealItemWrites = 0;

  await page.addInitScript((sessionUser) => {
    const serialized = JSON.stringify({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: sessionUser.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: sessionUser.email,
        user_metadata: {},
      },
    });
    const encoded = btoa(serialized)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    document.cookie = `sb-127-auth-token=base64-${encoded}; path=/; SameSite=Lax`;
  }, member);

  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      json: {
        id: member.id,
        email: member.email,
        user_metadata: { name: member.name },
      },
    });
  });
  await page.route('**/rest/v1/rpc/search_brand_foods**', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/brand_foods**', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/profiles**', async (route) => {
    await route.fulfill({
      json: {
        id: member.id,
        name: member.name,
        height_cm: member.height_cm,
        sex: member.sex,
        birth_year: member.birth_year,
        created_at: member.created_at,
      },
    });
  });
  await page.route('**/rest/v1/meal_logs**', async (route) => {
    if (route.request().method() === 'POST') {
      mealLogWrites += 1;
      if (mealLogWrites === 1) {
        await route.fulfill({
          status: 500,
          json: { message: 'deterministic test failure' },
        });
        return;
      }
      await route.fulfill({ status: 201, body: '' });
      return;
    }

    await route.fulfill({
      json: {
        id: 'meal-log-e2e',
        user_id: member.id,
        date: '2026-09-15',
        meal_type: '간식',
      },
    });
  });
  await page.route('**/rest/v1/meal_items**', async (route) => {
    mealItemWrites += 1;
    const submitted = route.request().postDataJSON() as Array<{
      food_name: string;
      serving: string;
      kcal: number;
      carbs_g: number;
      protein_g: number;
      fat_g: number;
    }>;
    await route.fulfill({
      status: 201,
      json: submitted.map((item, index) => ({
        ...item,
        id: `meal-item-e2e-${index}`,
        meal_log_id: 'meal-log-e2e',
      })),
    });
  });
  await seedGuestState(page, {
    users: [member],
    currentUserId: member.id,
  });
  await page.goto('/meals/add?date=2026-09-15&type=간식');
  await chooseLocalFood(page);

  const save = page.getByRole('button', { name: '이 음식 추가' });
  await save.click();
  await expect(
    page.getByText('식사 기록을 준비하는 중 문제가 발생했습니다.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/meals\/add/);

  await save.click();
  await expect(page).toHaveURL(/\/meals\?date=2026-09-15$/);
  expect(mealLogWrites).toBe(2);
  expect(mealItemWrites).toBe(1);

  const storedItems = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.mealLogs?.[0]?.items ?? [];
  });
  expect(storedItems).toHaveLength(1);
});
