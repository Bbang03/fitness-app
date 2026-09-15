import type { RecordType } from './types';

export const MAX_TARGET_REPS = 999;
export const MAX_TARGET_SECONDS = 3_600;

export function targetStep(recordType: RecordType | undefined) {
  return recordType === 'time' ? 15 : 1;
}

export function targetLimit(recordType: RecordType | undefined) {
  return recordType === 'time'
    ? MAX_TARGET_SECONDS
    : MAX_TARGET_REPS;
}

/** Return the next step, or null when the target is already at its limit. */
export function nextTargetValue(
  value: number,
  recordType: RecordType | undefined,
) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const next = value + targetStep(recordType);
  return next <= targetLimit(recordType) ? next : null;
}

export function isTargetValueValid(
  value: number,
  recordType: RecordType | undefined,
) {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= targetLimit(recordType)
  );
}

export function targetLimitMessage(
  recordType: RecordType | undefined,
) {
  if (recordType === 'time') {
    return `목표 시간은 ${MAX_TARGET_SECONDS.toLocaleString('ko-KR')}초 이하로 입력해주세요.`;
  }

  return `목표 횟수는 ${MAX_TARGET_REPS.toLocaleString('ko-KR')}회 이하로 입력해주세요.`;
}
