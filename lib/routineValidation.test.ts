import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTargetValueValid,
  nextTargetValue,
  targetLimitMessage,
} from './routineValidation';

test('caps repetition targets and rejects values above the cap', () => {
  assert.equal(nextTargetValue(998, 'weight_reps'), 999);
  assert.equal(nextTargetValue(999, 'reps_only'), null);
  assert.equal(nextTargetValue(99_999, 'weight_reps'), null);
  assert.equal(isTargetValueValid(999, 'reps_only'), true);
  assert.equal(isTargetValueValid(99_999, 'reps_only'), false);
});

test('uses a separate upper bound and step for time targets', () => {
  assert.equal(nextTargetValue(3_585, 'time'), 3_600);
  assert.equal(nextTargetValue(3_600, 'time'), null);
  assert.equal(isTargetValueValid(3_600, 'time'), true);
  assert.equal(targetLimitMessage('time'), '목표 시간은 3,600초 이하로 입력해주세요.');
});
