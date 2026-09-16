import {
  expect,
  mockSupabaseReads,
  seedGuestState,
  test,
} from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
});

test('로그아웃 상태에서 보호된 주요 화면 직접 접근을 로그인 화면으로 돌려보낸다', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    sessionStorage.setItem('chagok-intro-seen', '1');
    localStorage.removeItem('fittrack-store');
  });

  for (const path of [
    '/dashboard',
    '/routines/new',
    '/meals/add?date=2026-09-15&type=아침',
    '/inbody/new',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/, { timeout: 45_000 });
  }
});

test('guest 세션은 보호된 주요 화면을 직접 열 수 있다', async ({ page }) => {
  await seedGuestState(page);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/routines');
  await expect(page).toHaveURL(/\/routines$/);

  await page.goto('/meals?date=2026-09-15');
  await expect(page).toHaveURL(/\/meals\?date=2026-09-15$/);
});
