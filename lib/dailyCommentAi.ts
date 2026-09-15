import type {
  DailyCommentFindingId,
  DailyCommentNutritionStatus,
  DailyCommentReport,
} from './dailyComment';
import { isDateOnlyKey } from './utils';

export interface DailyCommentAiCopy {
  comment: string;
  positivePoint: string | null;
  nextAction: string;
}

/**
 * The only payload allowed to cross the client/server AI boundary.
 * It contains rule-engine conclusions and copy, never raw logs or identity.
 */
export interface DailyCommentAiJudgement {
  date: string;
  status: DailyCommentReport['status'];
  nutritionStatus: DailyCommentNutritionStatus;
  workoutCompleted: boolean;
  findingIds: DailyCommentFindingId[];
  deterministic: DailyCommentAiCopy;
}

const PUBLIC_FINDING_IDS = new Set<DailyCommentFindingId>([
  'workout_completed',
  'nutrition_missing',
  'nutrition_partial',
  'protein_below_target',
  'kcal_below_target',
  'nutrition_meets_targets',
]);

const BODY_COMPOSITION_FINDING_IDS = new Set<DailyCommentFindingId>([
  'measured_body_composition',
  'predicted_body_composition',
  'prediction_without_measurement',
]);

const MAX_COMMENT_LENGTH = 160;
const MAX_POSITIVE_POINT_LENGTH = 100;
const MAX_NEXT_ACTION_LENGTH = 140;

const DIGIT_PATTERN = /[0-9０-９]/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const UNSUPPORTED_BODY_CLAIM_PATTERN = /체성분|체중|골격근|체지방|인바디|예측/;
const NUTRITION_DEFICIT_PATTERN =
  /(단백질|열량|칼로리|에너지).{0,12}(부족|모자라?|미달|적(?:은|어|게)|낮(?:은|아))/;
const NUTRITION_COMPLETENESS_PATTERN =
  /(식단|식사|섭취).{0,16}(충분|완성|완벽|달성|균형이? 좋아|잘 맞|문제없)/;
const RECORD_CONTEXT_PATTERN = /기록|식단|식사/;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every((key) => expected.has(key)) &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (text.length === 0 || text.length > maxLength) return null;
  if (CONTROL_CHARACTER_PATTERN.test(text)) return null;

  return text;
}

function normalizedPositivePoint(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  return cleanText(value, MAX_POSITIVE_POINT_LENGTH) ?? undefined;
}

function copyContainsUnsupportedClaim(copy: DailyCommentAiCopy): boolean {
  return [copy.comment, copy.positivePoint ?? '', copy.nextAction]
    .some((text) => DIGIT_PATTERN.test(text) || UNSUPPORTED_BODY_CLAIM_PATTERN.test(text));
}

function copyBreaksNutritionSafety(
  copy: DailyCommentAiCopy,
  nutritionStatus: DailyCommentNutritionStatus,
): boolean {
  const text = [copy.comment, copy.positivePoint ?? '', copy.nextAction].join(' ');

  if (nutritionStatus === 'recorded') {
    return false;
  }

  // Partial or missing data cannot support a nutrient deficit or a complete-day claim.
  if (NUTRITION_DEFICIT_PATTERN.test(text) || NUTRITION_COMPLETENESS_PATTERN.test(text)) {
    return true;
  }

  // The main sentence must carry the incomplete-record caveat; putting a
  // reminder only in nextAction would still allow an overconfident headline.
  return !RECORD_CONTEXT_PATTERN.test(copy.comment);
}

function copyDropsKnownFinding(
  copy: DailyCommentAiCopy,
  judgement: DailyCommentAiJudgement,
): boolean {
  const text = [copy.comment, copy.positivePoint ?? '', copy.nextAction].join(' ');

  if (judgement.findingIds.includes('protein_below_target') && !/단백질/.test(text)) {
    return true;
  }

  if (judgement.findingIds.includes('kcal_below_target') && !/(열량|칼로리|에너지)/.test(text)) {
    return true;
  }

  if (
    judgement.deterministic.positivePoint === null &&
    copy.positivePoint !== null
  ) {
    return true;
  }

  return false;
}

/** Convert a deterministic report into the smallest safe AI input. */
export function createDailyCommentAiJudgement(
  report: DailyCommentReport,
): DailyCommentAiJudgement {
  const findingIds = report.evidence
    .filter((finding) => !BODY_COMPOSITION_FINDING_IDS.has(finding.id))
    .filter((finding) => PUBLIC_FINDING_IDS.has(finding.id))
    .slice(0, 3)
    .map((finding) => finding.id);

  return {
    date: report.date,
    status: report.status,
    nutritionStatus: report.nutrition.status,
    workoutCompleted: report.workout.completedWorkoutCount > 0,
    findingIds,
    deterministic: {
      comment: report.comment,
      positivePoint: report.positivePoint,
      nextAction: report.nextAction,
    },
  };
}

/** Stable request identity used to prevent stale async responses in the card. */
export function dailyCommentAiRequestKey(
  judgement: DailyCommentAiJudgement,
): string {
  return JSON.stringify(judgement);
}

/** Safe deterministic copy used when the provider is unavailable or rejected. */
export function dailyCommentAiFallback(
  judgement: DailyCommentAiJudgement,
): DailyCommentAiCopy {
  return { ...judgement.deterministic };
}

/** Validate a compact judgement before it reaches the provider. */
export function isDailyCommentAiJudgement(
  value: unknown,
): value is DailyCommentAiJudgement {
  const record = asRecord(value);
  if (!record || !hasExactKeys(record, [
    'date',
    'status',
    'nutritionStatus',
    'workoutCompleted',
    'findingIds',
    'deterministic',
  ])) {
    return false;
  }

  const date = typeof record.date === 'string' ? record.date : null;
  if (!isDateOnlyKey(date)) {
    return false;
  }

  if (record.status !== 'ready' && record.status !== 'incomplete') {
    return false;
  }

  if (
    record.nutritionStatus !== 'missing' &&
    record.nutritionStatus !== 'partial' &&
    record.nutritionStatus !== 'recorded'
  ) {
    return false;
  }

  if (typeof record.workoutCompleted !== 'boolean') return false;

  if (
    !Array.isArray(record.findingIds) ||
    record.findingIds.length > 3 ||
    record.findingIds.some((id) => !PUBLIC_FINDING_IDS.has(id as DailyCommentFindingId))
  ) {
    return false;
  }

  const deterministic = parseDailyCommentAiCopy(record.deterministic);
  if (!deterministic) return false;

  const judgement: DailyCommentAiJudgement = {
    date,
    status: record.status,
    nutritionStatus: record.nutritionStatus,
    workoutCompleted: record.workoutCompleted,
    findingIds: [...record.findingIds] as DailyCommentFindingId[],
    deterministic,
  };

  return !copyBreaksNutritionSafety(deterministic, judgement.nutritionStatus);
}

/**
 * Parse and validate the model's strict JSON response. Returning null always
 * triggers the deterministic report, so malformed or unsafe text is never shown.
 */
export function parseDailyCommentAiCopy(
  value: unknown,
  judgement?: DailyCommentAiJudgement,
): DailyCommentAiCopy | null {
  const record = asRecord(value);
  if (!record || !hasExactKeys(record, ['comment', 'positivePoint', 'nextAction'])) {
    return null;
  }

  const comment = cleanText(record.comment, MAX_COMMENT_LENGTH);
  const positivePoint = normalizedPositivePoint(record.positivePoint);
  const nextAction = cleanText(record.nextAction, MAX_NEXT_ACTION_LENGTH);

  if (!comment || positivePoint === undefined || !nextAction) {
    return null;
  }

  const copy: DailyCommentAiCopy = { comment, positivePoint, nextAction };
  if (copyContainsUnsupportedClaim(copy)) return null;

  if (judgement) {
    if (copyBreaksNutritionSafety(copy, judgement.nutritionStatus)) return null;
    if (copyDropsKnownFinding(copy, judgement)) return null;
  }

  return copy;
}

/** Prompt intentionally contains no raw meal, workout, body, or identity data. */
export function buildDailyCommentAiPrompt(
  judgement: DailyCommentAiJudgement,
): string {
  return [
    '너는 피트니스 앱의 한국어 코치 문장을 다듬는 편집자다.',
    '입력은 규칙 엔진이 이미 판정한 최소 결과다. 규칙의 의미와 우선순위를 바꾸지 말고 표현만 자연스럽게 다듬어라.',
    '반드시 JSON 객체 하나만 반환하고 키는 comment, positivePoint, nextAction 세 개만 사용하라.',
    '숫자, 날짜, 단위, 새로운 측정값, 체성분 수치, 식단·운동 로그의 세부사항을 추가하지 마라.',
    '입력의 nutritionStatus가 missing 또는 partial이면 단백질·열량 부족이나 하루 섭취 완료를 단정하지 말고 기록이 일부라 판단이 제한된다는 의미를 유지하라.',
    '입력의 findingIds에 있는 핵심 판단을 삭제하지 마라. positivePoint가 null이면 빈 문자열을 반환하라.',
    'comment는 160자 이하, positivePoint는 100자 이하, nextAction은 140자 이하의 짧은 한국어로 작성하라.',
    '',
    JSON.stringify(judgement),
  ].join('\n');
}
