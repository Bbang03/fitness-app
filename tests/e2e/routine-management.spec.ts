import {
  expect,
  guestUser,
  mockSupabaseReads,
  seedGuestState,
  test,
  workoutRoutine,
} from './fixtures';

const draftItem = {
  order: 0,
  exercise_name: '벤치프레스',
  target_sets: 3,
  target_reps: 10,
  target_weight_kg: 30,
  set_targets: [
    { weight_kg: 30, reps: 10, duration_seconds: 0 },
    { weight_kg: 30, reps: 10, duration_seconds: 0 },
    { weight_kg: 30, reps: 10, duration_seconds: 0 },
  ],
  rest_seconds: 60,
  record_type: 'weight_reps' as const,
  superset_group: null,
};

test.beforeEach(async ({ page }) => {
  await mockSupabaseReads(page);
});

test('작성 중인 루틴 초안을 복구하고 새 루틴으로 저장한다', async ({ page }) => {
  await seedGuestState(page, {
    routines: [],
    routineDraft: {
      name: '상체 집중',
      items: [draftItem],
    },
  });
  await page.goto('/routines/new');

  await expect(page.getByPlaceholder('루틴 이름')).toHaveValue('상체 집중');
  await expect(page.getByText('벤치프레스', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '루틴 저장' }).click();

  await expect(page).toHaveURL(/\/routines$/);
  await expect(page.getByText('상체 집중', { exact: true })).toBeVisible();

  const saved = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return {
      routine: persisted.state?.routines?.[0],
      draft: persisted.state?.routineDraft,
    };
  });
  expect(saved.routine?.user_id).toBe(guestUser.id);
  expect(saved.routine?.items).toHaveLength(1);
  expect(saved.draft ?? null).toBeNull();
});

test('루틴 이름과 운동 목표를 수정해 저장한다', async ({ page }) => {
  await seedGuestState(page);
  await page.goto(`/routines/${workoutRoutine.id}`);

  const name = page.getByPlaceholder('루틴 이름');
  await name.fill('전신 루틴 수정본');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '완료', exact: true })).toBeVisible();

  const persistedName = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.routines?.find(
      (routine: { id: string }) => routine.id === 'routine-e2e',
    )?.name;
  });
  expect(persistedName).toBe('전신 루틴 수정본');
});

test('빈 루틴 이름은 저장하지 않고 검증 메시지를 표시한다', async ({ page }) => {
  await seedGuestState(page, {
    routines: [],
    routineDraft: { name: '임시 루틴', items: [draftItem] },
  });
  await page.goto('/routines/new');

  await page.getByPlaceholder('루틴 이름').fill('');
  await page.getByRole('button', { name: '루틴 저장' }).click();

  await expect(page.getByText('루틴 이름을 입력해주세요.')).toBeVisible();
  await expect(page).toHaveURL(/\/routines\/new$/);
});

test('스와이프로 루틴 삭제 동작을 노출하고 guest 루틴을 삭제한다', async ({ page }) => {
  await seedGuestState(page);
  await page.goto('/routines');

  const start = page.getByRole('button', {
    name: `${workoutRoutine.name} 운동 시작`,
  });
  const card = start.locator('xpath=ancestor::div[contains(@class,"cursor-pointer")]');
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await card.dispatchEvent('pointerdown', {
    pointerId: 1,
    clientX: box.x + box.width - 30,
    clientY: box.y + box.height / 2,
  });
  await card.dispatchEvent('pointermove', {
    pointerId: 1,
    clientX: box.x + 30,
    clientY: box.y + box.height / 2,
  });
  await card.dispatchEvent('pointerup', {
    pointerId: 1,
    clientX: box.x + 30,
    clientY: box.y + box.height / 2,
  });

  const remove = page.getByRole('button', { name: `${workoutRoutine.name} 삭제` });
  await expect(remove).toBeVisible();
  await expect(card).toHaveCSS('transform', /matrix\(1, 0, 0, 1, -92, 0\)/);
  await remove.click();
  await expect(page.getByText(workoutRoutine.name, { exact: true })).toHaveCount(0);

  const count = await page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.routines?.length;
  });
  expect(count).toBe(0);
});
