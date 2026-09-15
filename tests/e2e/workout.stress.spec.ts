import type { Locator, Page } from '@playwright/test';
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

async function tapAtCenter(page: Page, locator: Locator, count: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();

  for (let index = 0; index < count; index += 1) {
    await page.mouse.click(
      box!.x + box!.width / 2,
      box!.y + box!.height / 2,
    );
  }
}

async function persistedWorkout(page: Page) {
  return page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('fittrack-store') ?? '{}');
    return persisted.state?.activeWorkout ?? null;
  });
}

test('pointer 연타 +/- 결과가 3회 반복에서도 정확하다', async ({ page }) => {
  test.setTimeout(60_000);
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  const increase = page.getByRole('button', { name: '횟수 1 증가' }).first();
  const decrease = page.getByRole('button', { name: '횟수 1 감소' }).first();
  const value = page.getByRole('button', { name: /^횟수 입력값/ }).first();

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await tapAtCenter(page, increase, 25);
    await expect(value).toHaveAccessibleName('횟수 입력값 33회');

    await tapAtCenter(page, decrease, 25);
    await expect(value).toHaveAccessibleName('횟수 입력값 8회');

    for (let index = 0; index < 20; index += 1) {
      await increase.click();
      await decrease.click();
    }
    await expect(value).toHaveAccessibleName('횟수 입력값 8회');
  }
});

test('0kg·소수점 무게·큰 무게와 큰 반복 횟수를 정확히 기록한다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  const weightValue = page.getByRole('button', { name: /^무게 입력값/ }).first();
  await weightValue.click();
  await page.getByRole('button', { name: '입력값 초기화' }).click();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(weightValue).toHaveAccessibleName('무게 입력값 0kg');

  await weightValue.click();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: '9', exact: true }).click();
  }
  await page.getByRole('button', { name: '.', exact: true }).click();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(weightValue).toHaveAccessibleName('무게 입력값 9999.5kg');

  const repsValue = page.getByRole('button', { name: /^횟수 입력값/ }).first();
  await repsValue.click();
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: '9', exact: true }).click();
  }
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(repsValue).toHaveAccessibleName('횟수 입력값 9999회');

  await page.getByRole('button', { name: '1세트 완료' }).click();
  const workout = await persistedWorkout(page);
  expect(workout.completedSets).toHaveLength(1);
  expect(workout.completedSets[0]).toMatchObject({
    weight_kg: 9999.5,
    reps: 9999,
  });
});

test('세트 완료 5회 연타가 첫·중간·마지막 세트를 건너뛰지 않는다', async ({ page }) => {
  const threeSetRoutine = {
    ...workoutRoutine,
    items: [
      {
        ...workoutRoutine.items[1],
        target_sets: 3,
        set_targets: Array.from({ length: 3 }, () => ({
          weight_kg: 0,
          reps: 12,
          duration_seconds: 0,
        })),
      },
    ],
  };

  await seedGuestState(page, {
    routines: [threeSetRoutine],
    activeWorkout: {
      ...makeActiveWorkout(),
      exercises: threeSetRoutine.items,
    },
  });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  await tapAtCenter(page, page.getByRole('button', { name: '1세트 완료' }), 5);
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeEnabled();
  let workout = await persistedWorkout(page);
  expect(workout.currentSetIndex).toBe(1);
  expect(workout.completedSets).toHaveLength(1);

  await tapAtCenter(page, page.getByRole('button', { name: '2세트 완료' }), 5);
  await expect(page.getByRole('button', { name: '3세트 완료' })).toBeVisible();
  await expect(page.getByRole('button', { name: '3세트 완료' })).toBeEnabled();
  workout = await persistedWorkout(page);
  expect(workout.currentSetIndex).toBe(2);
  expect(workout.completedSets).toHaveLength(2);

  await tapAtCenter(page, page.getByRole('button', { name: '3세트 완료' }), 5);
  await expect(page.getByRole('heading', { name: '운동 완료!' })).toBeVisible();
  workout = await persistedWorkout(page);
  expect(workout.completedSets).toHaveLength(3);
});

test('수정한 현재 세트 입력값이 reload 후에도 유지된다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  await tapAtCenter(page, page.getByRole('button', { name: '횟수 1 증가' }).first(), 7);
  await tapAtCenter(page, page.getByRole('button', { name: '무게 1 증가' }).first(), 3);
  await expect(
    page.getByRole('button', { name: /^횟수 입력값/ }).first(),
  ).toHaveAccessibleName('횟수 입력값 15회');
  await expect(
    page.getByRole('button', { name: /^무게 입력값/ }).first(),
  ).toHaveAccessibleName('무게 입력값 43kg');

  await page.reload();
  await expect(
    page.getByRole('button', { name: /^횟수 입력값/ }).first(),
  ).toHaveAccessibleName('횟수 입력값 15회');
  await expect(
    page.getByRole('button', { name: /^무게 입력값/ }).first(),
  ).toHaveAccessibleName('무게 입력값 43kg');
});

test('휴식 조절·reload·화면 이동·skip 후 진행 상태가 유지된다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto(`/routines/${workoutRoutine.id}/workout`);

  await page.getByRole('button', { name: '1세트 완료' }).click();
  await expect(page.getByText('휴식 시간', { exact: true })).toBeVisible();

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: '휴식 15초 증가' }).click();
    await page.getByRole('button', { name: '휴식 15초 감소' }).click();
  }

  // 병렬 CI 부하 중에도 타이머가 자연 종료되지 않도록 검증 여유를 확보한다.
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: '휴식 15초 증가' }).click();
  }

  await page.reload();
  await expect(page.getByText('휴식 시간', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();

  await page.goto('/routines');
  await page.getByRole('link', { name: '이어서' }).click();
  await expect(page.getByText('휴식 시간', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '휴식 건너뛰기' }).click();
  await expect(page.getByText('휴식 시간', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();
});

test('browser back/forward를 반복해도 같은 운동 세션으로 복귀한다', async ({ page }) => {
  await seedGuestState(page, { activeWorkout: makeActiveWorkout() });
  await page.goto('/routines');
  await page.getByRole('link', { name: '이어서' }).click();
  await page.getByRole('button', { name: '1세트 완료' }).click();

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await page.goBack();
    await expect(page).toHaveURL(/\/routines$/);
    await expect(page.getByText('진행 중인 운동', { exact: true })).toBeVisible();

    await page.goForward();
    await expect(page.getByRole('button', { name: '2세트 완료' })).toBeVisible();
  }

  const workout = await persistedWorkout(page);
  expect(workout.completedSets).toHaveLength(1);
  expect(workout.currentSetIndex).toBe(1);
});

test('루틴 시작 팝업 종료 방식과 재시작을 3회 반복한다', async ({ page }) => {
  await seedGuestState(page);
  await page.goto('/routines');

  const play = page.getByRole('button', { name: `${workoutRoutine.name} 운동 시작` });

  await play.click();
  await page.mouse.click(8, 8);
  await expect(page.getByRole('button', { name: '취소' })).toHaveCount(0);

  await play.click();
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByRole('button', { name: '취소' })).toHaveCount(0);

  await play.click();
  await page.getByRole('button', { name: '취소' }).click();

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await play.click();
    const start = page.getByRole('button', { name: '운동 시작', exact: true });
    const box = await start.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(
      box!.x + box!.width / 2,
      box!.y + box!.height / 2,
      { clickCount: 2 },
    );

    await expect(page.getByRole('heading', { name: '스쿼트' })).toBeVisible();
    await expect(page.getByText('운동 구성을 확인하고 시작하세요.')).toHaveCount(0);
    const startedWorkout = await persistedWorkout(page);
    expect(startedWorkout.completedSets).toHaveLength(0);

    await page.getByRole('button', { name: '운동 종료' }).click();
    await page.getByRole('button', { name: '운동 종료', exact: true }).last().click();
    await expect(page).toHaveURL(/\/routines$/);
  }
});
