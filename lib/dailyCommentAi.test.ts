import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDailyComment,
} from './dailyComment';
import {
  buildDailyCommentAiPrompt,
  createDailyCommentAiJudgement,
  dailyCommentAiFallback,
  isDailyCommentAiJudgement,
  parseDailyCommentAiCopy,
} from './dailyCommentAi';
import type {
  MealLog,
  WorkoutLog,
} from './types';

const DATE = '2026-09-14';

function meal(id: string, mealType: MealLog['meal_type']): MealLog {
  return {
    id,
    user_id: 'user',
    date: DATE,
    meal_type: mealType,
    items: [{
      id: `${id}-item`,
      meal_log_id: id,
      food_name: '식사',
      serving: '1인분',
      kcal: 700,
      carbs_g: 80,
      protein_g: 35,
      fat_g: 20,
    }],
  };
}

function workout(): WorkoutLog {
  return {
    id: 'workout',
    user_id: 'user',
    routine_id: 'routine',
    routine_name: '루틴',
    date: DATE,
    started_at: `${DATE}T09:00:00.000Z`,
    finished_at: `${DATE}T10:00:00.000Z`,
    sets: [],
  };
}

function recordedReport() {
  return buildDailyComment({
    date: DATE,
    mealLogs: [
      meal('breakfast', '아침'),
      meal('lunch', '점심'),
      meal('dinner', '저녁'),
    ],
    workoutLogs: [workout()],
    targets: { kcal: 2_000, protein_g: 100 },
  });
}

function partialReport() {
  return buildDailyComment({
    date: DATE,
    mealLogs: [meal('snack', '간식')],
    workoutLogs: [workout()],
    targets: { kcal: 2_000, protein_g: 120 },
  });
}

test('projects only compact rule conclusions for the AI request', () => {
  // Keep this fixture focused on the public projection; the report itself
  // still contains detailed evidence that must not cross the boundary.
  const report = recordedReport();
  const judgement = createDailyCommentAiJudgement(report);

  assert.equal(judgement.date, DATE);
  assert.equal(judgement.nutritionStatus, 'recorded');
  assert.equal(judgement.workoutCompleted, true);
  assert.ok(judgement.findingIds.includes('workout_completed'));
  assert.equal('bodyComposition' in judgement, false);
  assert.equal(JSON.stringify(judgement).includes('총 볼륨'), false);
  assert.equal(isDailyCommentAiJudgement(judgement), true);
});

test('accepts a concise model copy that preserves the rule result', () => {
  const judgement = createDailyCommentAiJudgement(recordedReport());
  const copy = parseDailyCommentAiCopy({
    comment: '오늘은 운동과 식단 흐름이 잘 맞았어요.',
    positivePoint: '운동과 식사를 함께 기록했어요.',
    nextAction: '내일도 이 흐름을 이어가 보세요.',
  }, judgement);

  assert.deepEqual(copy, {
    comment: '오늘은 운동과 식단 흐름이 잘 맞았어요.',
    positivePoint: '운동과 식사를 함께 기록했어요.',
    nextAction: '내일도 이 흐름을 이어가 보세요.',
  });
});

test('rejects extra keys, invented numbers, and unsupported partial-day claims', () => {
  const judgement = createDailyCommentAiJudgement(partialReport());
  const base = {
    comment: '오늘 기록을 바탕으로 흐름을 확인했어요.',
    positivePoint: '운동을 기록했어요.',
    nextAction: '남은 식사도 기록해 주세요.',
  };

  assert.equal(parseDailyCommentAiCopy({ ...base, extra: 'nope' }, judgement), null);
  assert.equal(parseDailyCommentAiCopy({ ...base, comment: '단백질이 40g 부족했어요.' }, judgement), null);
  assert.equal(parseDailyCommentAiCopy({ ...base, comment: '오늘 식단 섭취가 충분했어요.' }, judgement), null);
  assert.equal(parseDailyCommentAiCopy({ ...base, comment: '운동 흐름이 좋았어요.' }, judgement), null);
});

test('keeps the deterministic fallback and prompt free of detailed evidence', () => {
  const report = recordedReport();
  const judgement = createDailyCommentAiJudgement(report);
  const prompt = buildDailyCommentAiPrompt(judgement);

  assert.deepEqual(dailyCommentAiFallback(judgement), judgement.deterministic);
  assert.match(prompt, /findingIds/);
  assert.equal(prompt.includes('총 볼륨'), false);
  assert.equal(prompt.includes('bodyComposition'), false);
});

test('rejects raw-log fields at the API boundary', () => {
  const judgement = createDailyCommentAiJudgement(recordedReport());

  assert.equal(
    isDailyCommentAiJudgement({ ...judgement, mealLogs: [] }),
    false,
  );
  assert.equal(
    isDailyCommentAiJudgement({
      ...judgement,
      deterministic: {
        ...judgement.deterministic,
        comment: '오늘은 2,000kcal를 먹었어요.',
      },
    }),
    false,
  );
});
