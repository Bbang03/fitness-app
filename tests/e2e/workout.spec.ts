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

test('루틴 카드에서 확인 후 첫 운동으로 바로 진입한다', async ({ page }) => {
  await seedGuestState(page);
  await page.goto('/routines');

  const playButton = page.getByRole('button', {
    name: `${workoutRoutine.name} 운동 시작`,
  });

  await playButton.click();
  await expect(
    page.getByRole('heading', {
      name: `'${workoutRoutine.name}' 루틴을 시작하겠습니까?`,
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.getByRole('button', { name: '취소' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/routines$/);

  await playButton.click();
  await page.getByRole('button', { name: '운동 시작', exact: true }).click();

  await expect(page).toHaveURL(`/routines/${workoutRoutine.id}/workout`);
  await expect(page.getByRole('heading', { name: '스쿼트' })).toBeVisible();
  await expect(
    page.getByText('운동 구성을 확인하고 시작하세요.'),
  ).toHaveCount(0);
});

test('반복 횟수 빠른 연속 입력을 누락하지 않는다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  const increase = page.getByRole('button', { name: '횟수 1 증가' }).first();
  const decrease = page.getByRole('button', { name: '횟수 1 감소' }).first();
  const value = page.getByRole('button', { name: /^횟수 입력값/ }).first();

  await expect(value).toHaveAccessibleName('횟수 입력값 8회');

  for (let index = 0; index < 10; index += 1) {
    await increase.click();
  }
  await expect(value).toHaveAccessibleName('횟수 입력값 18회');

  for (let index = 0; index < 7; index += 1) {
    await decrease.click();
  }
  await expect(value).toHaveAccessibleName('횟수 입력값 11회');
});

test('반복 횟수 0회를 기록할 수 있고 음수로 내려가지 않는다', async ({ page }) => {
  const oneRepRoutine = {
    ...workoutRoutine,
    items: [
      {
        ...workoutRoutine.items[1],
        target_reps: 1,
        set_targets: [{ weight_kg: 0, reps: 1, duration_seconds: 0 }],
      },
    ],
  };
  const activeWorkout = {
    ...makeActiveWorkout(),
    exercises: oneRepRoutine.items,
  };

  await seedGuestState(page, {
    routines: [oneRepRoutine],
    activeWorkout,
  });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  const decrease = page.getByRole('button', { name: '횟수 1 감소' });
  const value = page.getByRole('button', { name: /^횟수 입력값/ });

  await expect(value).toHaveAccessibleName('횟수 입력값 1회');
  await decrease.click();
  await expect(value).toHaveAccessibleName('횟수 입력값 0회');
  await decrease.click();
  await expect(value).toHaveAccessibleName('횟수 입력값 0회');

  await page.getByRole('button', { name: '1세트 완료' }).click();
  await expect(page.getByRole('heading', { name: '운동 완료!' })).toBeVisible();
  await expect(page.getByText('0회', { exact: true })).toBeVisible();
});

test('휴식 중에도 다음 세트를 수정하고 완료할 수 있다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  await page.getByRole('button', { name: '1세트 완료' }).click();
  await expect(page.getByText('휴식 시간', { exact: true })).toBeVisible();
  await expect(
    page.getByText('휴식 시간이 남아 있어도 다음 세트를 계속할 수 있습니다.'),
  ).toBeVisible();

  const secondSetIncrease = page.getByRole('button', { name: '횟수 1 증가' }).nth(1);
  const secondSetValue = page.getByRole('button', { name: /^횟수 입력값/ }).nth(1);
  await secondSetIncrease.click();
  await expect(secondSetValue).toHaveAccessibleName('횟수 입력값 9회');

  await page.getByRole('button', { name: '2세트 완료' }).click();
  await expect(page.getByRole('heading', { name: '푸시업' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1세트 완료' })).toBeVisible();
});

test('운동의 마지막 세트는 다음 운동과 최종 완료 화면으로 전환한다', async ({ page }) => {
  const transitionRoutine = {
    ...workoutRoutine,
    items: [
      {
        ...workoutRoutine.items[0],
        target_sets: 1,
        set_targets: [{ weight_kg: 40, reps: 8, duration_seconds: 0 }],
      },
      workoutRoutine.items[1],
    ],
  };
  const activeWorkout = {
    ...makeActiveWorkout(),
    exercises: transitionRoutine.items,
  };

  await seedGuestState(page, {
    routines: [transitionRoutine],
    activeWorkout,
  });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  await page.getByRole('button', { name: '1세트 완료' }).click();
  await expect(page.getByRole('heading', { name: '푸시업' })).toBeVisible();
  await page.getByRole('button', { name: '1세트 완료' }).click();
  await expect(page.getByRole('heading', { name: '운동 완료!' })).toBeVisible();

  const saveWorkout = page.getByRole('button', { name: '운동 기록 저장' });
  await expect(saveWorkout).toBeEnabled();
  await saveWorkout.click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
});

test('진행 중 운동은 reload와 루틴 목록의 이어서 이동 후에도 유지된다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  await page.getByRole('button', { name: '1세트 완료' }).click();
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '스쿼트' })).toBeVisible();
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();

  await page.goto('/routines');
  await expect(page.getByText('진행 중인 운동', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '이어서' }).click();
  await expect(page).toHaveURL(`/routines/${workoutRoutine.id}/workout`);
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();
});
