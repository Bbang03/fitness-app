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

test('운동 시작 확인창은 dialog로 안내되고 키보드 Escape로 닫힌다', async ({ page }) => {
  await page.goto('/routines');
  await page
    .getByRole('button', { name: `${workoutRoutine.name} 운동 시작` })
    .click();

  const dialog = page.getByRole('dialog', {
    name: `'${workoutRoutine.name}' 루틴을 시작하겠습니까?`,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('키보드만으로 운동 시작 확인과 첫 운동 진입이 가능하다', async ({ page }) => {
  await page.goto('/routines');
  const start = page.getByRole('button', {
    name: `${workoutRoutine.name} 운동 시작`,
  });
  await start.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '운동 시작' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(
    new RegExp(`/routines/${workoutRoutine.id}/workout$`),
    { timeout: 15_000 },
  );
});
