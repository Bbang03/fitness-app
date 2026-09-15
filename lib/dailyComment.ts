import { normalizeMealNutrition } from './mealSave';
import { addDaysToDateKey, isDateOnlyKey } from './utils';
import type {
  InbodyRecord,
  MealLog,
  NutritionSummary,
  WorkoutLog,
} from './types';

/**
 * Nutrition goals are deliberately optional.  A missing goal means that the
 * engine can report what was recorded, but must not invent a target or call
 * the intake insufficient.
 */
export interface DailyCommentTargets {
  kcal?: number | null;
  protein_g?: number | null;
}

export type DailyCommentNutritionStatus =
  | 'missing'
  | 'partial'
  | 'recorded';

export type DailyCommentFindingTone =
  | 'positive'
  | 'attention'
  | 'neutral';

export type DailyCommentFindingId =
  | 'workout_completed'
  | 'nutrition_missing'
  | 'nutrition_partial'
  | 'protein_below_target'
  | 'kcal_below_target'
  | 'nutrition_meets_targets'
  | 'measured_body_composition'
  | 'predicted_body_composition'
  | 'prediction_without_measurement';

export interface DailyCommentFinding {
  id: DailyCommentFindingId;
  tone: DailyCommentFindingTone;
  label: string;
  detail: string;
}

export interface DailyCommentPrediction {
  /** Days after the measured baseline represented by the prediction. */
  horizonDays?: number | null;
  predictedWeightKg?: number | null;
  predictedSkeletalMuscleKg?: number | null;
  predictedBodyFatKg?: number | null;
  predictedBodyFatPct?: number | null;
  deltaWeightKg?: number | null;
  deltaSkeletalMuscleKg?: number | null;
  deltaBodyFatKg?: number | null;
  deltaBodyFatPct?: number | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  modelVersion?: string | null;
  /** Optional explicit link to the measured record used as the baseline. */
  baselineMeasuredAt?: string | null;
}

export interface DailyCommentInput {
  /** YYYY-MM-DD date to analyse. */
  date: string;
  mealLogs: readonly MealLog[];
  workoutLogs: readonly WorkoutLog[];
  targets?: DailyCommentTargets;
  latestMeasuredBodyComposition?: InbodyRecord | null;
  prediction?: DailyCommentPrediction | null;
  /**
   * The engine cannot infer whether an unlogged meal was skipped or forgotten.
   * Pass partial when the caller knows that only part of the day is recorded.
   * Without this field, the presence of at least one valid meal is treated as
   * recorded and an empty day is treated as missing.
   */
  mealRecordStatus?: DailyCommentNutritionStatus;
  /** Ratio below which a target is considered meaningfully below target. */
  belowTargetRatio?: number;
}

export interface DailyCommentPredictionReadinessInput {
  today: string;
  measuredAt?: string | null;
  recordedNutritionDays: number;
  completedWorkoutVolumeKg: number;
  confidence?: 'low' | 'medium' | 'high' | null;
}

export interface DailyCommentNutritionAnalysis {
  status: DailyCommentNutritionStatus;
  summary: NutritionSummary;
  recordedMealCount: number;
  recordedMealTypes: string[];
  invalidItemCount: number;
  targets: DailyCommentTargets;
  targetRatios: {
    kcal: number | null;
    protein_g: number | null;
  };
}

export type DailyCommentWorkoutMode =
  | 'resistance'
  | 'cardio'
  | 'mixed'
  | 'unknown';

export interface DailyCommentWorkoutAnalysis {
  completedWorkoutCount: number;
  completedSetCount: number;
  totalVolumeKg: number;
  totalDurationMinutes: number;
  mode: DailyCommentWorkoutMode;
}

export interface DailyMeasuredBodyComposition {
  source: 'measured';
  measuredAt: string;
  weightKg: number;
  skeletalMuscleKg: number;
  bodyFatKg: number;
  bodyFatPct: number;
}

export interface DailyPredictedBodyComposition {
  source: 'predicted';
  horizonDays: number | null;
  predictedWeightKg: number | null;
  predictedSkeletalMuscleKg: number | null;
  predictedBodyFatKg: number | null;
  predictedBodyFatPct: number | null;
  confidence: 'low' | 'medium' | 'high' | null;
  modelVersion: string | null;
}

export interface DailyCommentBodyCompositionAnalysis {
  /** A snapshot from a real measurement, if one is available and valid. */
  measured: DailyMeasuredBodyComposition | null;
  /** A model scenario, kept separate from the real measurement snapshot. */
  prediction: DailyPredictedBodyComposition | null;
  note: string | null;
}

export interface DailyCommentReport {
  date: string;
  /** `incomplete` means the primary conclusion is limited by missing data. */
  status: 'ready' | 'incomplete';
  comment: string;
  positivePoint: string | null;
  nextAction: string;
  evidence: DailyCommentFinding[];
  nutrition: DailyCommentNutritionAnalysis;
  workout: DailyCommentWorkoutAnalysis;
  bodyComposition: DailyCommentBodyCompositionAnalysis;
}

export const DEFAULT_DAILY_COMMENT_BELOW_TARGET_RATIO = 0.8;
export const DAILY_COMMENT_PREDICTION_HORIZON_DAYS = 30;

const EMPTY_NUTRITION: NutritionSummary = {
  kcal: 0,
  carbs_g: 0,
  protein_g: 0,
  fat_g: 0,
};

const CARDIO_NAME_PATTERN =
  /달리기|러닝|걷기|사이클|자전거|로잉|유산소|줄넘기|수영|등산|running|cycling|rowing|cardio/i;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveFinite(value: unknown): value is number {
  return finite(value) && value > 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatNumber(value: number, digits = 1): string {
  const rounded = round(value, digits);
  return rounded.toLocaleString('ko-KR', {
    maximumFractionDigits: digits,
  });
}

function formatKg(value: number): string {
  return `${formatNumber(value)}kg`;
}

function validRatio(value: number | undefined): number {
  return finite(value) && value > 0 && value <= 1
    ? value
    : DEFAULT_DAILY_COMMENT_BELOW_TARGET_RATIO;
}

function validTarget(value: number | null | undefined): number | null {
  return positiveFinite(value) ? value : null;
}

function measurementDateKey(value: string | null | undefined): string | null {
  const candidate = value?.includes('T') ? value.slice(0, 10) : value;
  return candidate && isDateOnlyKey(candidate) ? candidate : null;
}

/** Returns the same date-only target used by the Insights expiry rule. */
export function dailyCommentPredictionTargetDate(
  measuredAt: string | null | undefined,
): string | null {
  const measuredDate = measurementDateKey(measuredAt);
  return measuredDate
    ? addDaysToDateKey(measuredDate, DAILY_COMMENT_PREDICTION_HORIZON_DAYS)
    : null;
}

/** Gate the numeric forecast shown beside the daily coach comment. */
export function canShowDailyCommentPrediction({
  today,
  measuredAt,
  recordedNutritionDays,
  completedWorkoutVolumeKg,
  confidence,
}: DailyCommentPredictionReadinessInput): boolean {
  const targetDate = dailyCommentPredictionTargetDate(measuredAt);

  return Boolean(
    targetDate &&
      isDateOnlyKey(today) &&
      targetDate > today &&
      recordedNutritionDays >= 7 &&
      completedWorkoutVolumeKg > 0 &&
      confidence === 'high',
  );
}

/** Infer a day's completeness from valid nutrition and the three regular meals. */
export function dailyCommentMealRecordStatus(
  date: string,
  mealLogs: readonly MealLog[],
): DailyCommentNutritionStatus {
  let hasValidNutrition = false;
  const regularMealTypes = new Set<string>();

  for (const meal of mealLogs) {
    if (meal.date !== date) continue;

    const items = Array.isArray(meal.items) ? meal.items : [];
    const hasValidItem = items.some((item) => Boolean(normalizeMealNutrition(item)));
    if (!hasValidItem) continue;

    hasValidNutrition = true;
    if (meal.meal_type !== '간식') {
      regularMealTypes.add(meal.meal_type);
    }
  }

  if (!hasValidNutrition) return 'missing';
  return regularMealTypes.size >= 3 ? 'recorded' : 'partial';
}

/** Keep only completed workouts in a deterministic recent-day window. */
export function completedWorkoutLogsWithinDays(
  workoutLogs: readonly WorkoutLog[],
  now: Date,
  windowDays = 7,
): WorkoutLog[] {
  const nowMs = now.getTime();
  const maxAgeMs = windowDays * 24 * 60 * 60 * 1000;

  return workoutLogs.filter((log) => {
    if (!log.finished_at) return false;
    const workoutMs = Date.parse(log.started_at);
    if (!Number.isFinite(workoutMs)) return false;
    const ageMs = nowMs - workoutMs;
    return ageMs >= 0 && ageMs <= maxAgeMs;
  });
}

function emptyNutrition(
  status: DailyCommentNutritionStatus,
  targets: DailyCommentTargets,
): DailyCommentNutritionAnalysis {
  return {
    status,
    summary: { ...EMPTY_NUTRITION },
    recordedMealCount: 0,
    recordedMealTypes: [],
    invalidItemCount: 0,
    targets,
    targetRatios: {
      kcal: null,
      protein_g: null,
    },
  };
}

function analyzeNutrition(
  date: string,
  mealLogs: readonly MealLog[],
  targets: DailyCommentTargets,
  explicitStatus?: DailyCommentNutritionStatus,
): DailyCommentNutritionAnalysis {
  const nutrition = emptyNutrition('missing', targets);
  const matchingLogs = mealLogs.filter((meal) => meal.date === date);

  for (const meal of matchingLogs) {
    const items = Array.isArray(meal.items) ? meal.items : [];
    let validItemCount = 0;

    for (const item of items) {
      const normalized = normalizeMealNutrition(item);
      if (!normalized) {
        nutrition.invalidItemCount += 1;
        continue;
      }

      validItemCount += 1;
      nutrition.summary.kcal += normalized.kcal;
      nutrition.summary.carbs_g += normalized.carbs_g;
      nutrition.summary.protein_g += normalized.protein_g;
      nutrition.summary.fat_g += normalized.fat_g;
    }

    if (validItemCount > 0) {
      nutrition.recordedMealCount += 1;
      if (!nutrition.recordedMealTypes.includes(meal.meal_type)) {
        nutrition.recordedMealTypes.push(meal.meal_type);
      }
    }
  }

  nutrition.summary = {
    kcal: round(nutrition.summary.kcal),
    carbs_g: round(nutrition.summary.carbs_g),
    protein_g: round(nutrition.summary.protein_g),
    fat_g: round(nutrition.summary.fat_g),
  };

  const inferredStatus = dailyCommentMealRecordStatus(date, mealLogs);

  if (explicitStatus === 'missing' || inferredStatus === 'missing') {
    nutrition.status = 'missing';
  } else if (explicitStatus === 'partial' || inferredStatus === 'partial') {
    nutrition.status = 'partial';
  } else {
    nutrition.status = 'recorded';
  }

  const kcalTarget = validTarget(targets.kcal);
  const proteinTarget = validTarget(targets.protein_g);
  nutrition.targets = {
    kcal: kcalTarget,
    protein_g: proteinTarget,
  };
  nutrition.targetRatios = {
    kcal: nutrition.status !== 'missing' && kcalTarget
      ? round(nutrition.summary.kcal / kcalTarget, 2)
      : null,
    protein_g: nutrition.status !== 'missing' && proteinTarget
      ? round(nutrition.summary.protein_g / proteinTarget, 2)
      : null,
  };

  return nutrition;
}

function durationMinutes(workout: WorkoutLog): number {
  if (!workout.started_at || !workout.finished_at) return 0;
  const started = Date.parse(workout.started_at);
  const finished = Date.parse(workout.finished_at);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
  if (finished < started) return 0;
  return (finished - started) / 60_000;
}

function analyzeWorkout(
  date: string,
  workoutLogs: readonly WorkoutLog[],
): DailyCommentWorkoutAnalysis {
  const completed = workoutLogs.filter(
    (workout) => workout.date === date && Boolean(workout.finished_at),
  );

  let completedSetCount = 0;
  let totalVolumeKg = 0;
  let totalDurationMinutes = 0;
  let resistanceSignals = 0;
  let cardioSignals = 0;

  for (const workout of completed) {
    const sets = Array.isArray(workout.sets) ? workout.sets : [];
    totalDurationMinutes += durationMinutes(workout);

    for (const set of sets) {
      completedSetCount += 1;

      const weight = nonNegativeFinite(set.weight_kg)
        ? set.weight_kg
        : 0;
      const reps = nonNegativeFinite(set.reps) ? set.reps : 0;
      totalVolumeKg += weight * reps;

      const cardioName = CARDIO_NAME_PATTERN.test(set.exercise_name ?? '');
      const timeBased = set.record_type === 'time' ||
        (set.duration_seconds ?? 0) > 0;

      if (cardioName || timeBased) cardioSignals += 1;
      if (!cardioName && !timeBased && (weight > 0 || reps > 0)) {
        resistanceSignals += 1;
      }
    }
  }

  const mode: DailyCommentWorkoutMode =
    resistanceSignals > 0 && cardioSignals > 0
      ? 'mixed'
      : resistanceSignals > 0
        ? 'resistance'
        : cardioSignals > 0
          ? 'cardio'
          : completed.length > 0
            ? 'unknown'
            : 'unknown';

  return {
    completedWorkoutCount: completed.length,
    completedSetCount,
    totalVolumeKg: round(totalVolumeKg),
    totalDurationMinutes: round(totalDurationMinutes),
    mode,
  };
}

function measuredSnapshot(
  record: InbodyRecord | null | undefined,
): DailyMeasuredBodyComposition | null {
  if (!record || typeof record.measured_at !== 'string' || !record.measured_at) {
    return null;
  }

  if (
    !positiveFinite(record.weight_kg) ||
    !positiveFinite(record.skeletal_muscle_kg) ||
    !positiveFinite(record.body_fat_kg) ||
    !nonNegativeFinite(record.body_fat_pct)
  ) {
    return null;
  }

  return {
    source: 'measured',
    measuredAt: record.measured_at,
    weightKg: round(record.weight_kg),
    skeletalMuscleKg: round(record.skeletal_muscle_kg),
    bodyFatKg: round(record.body_fat_kg),
    bodyFatPct: round(record.body_fat_pct),
  };
}

function predictionSnapshot(
  prediction: DailyCommentPrediction | null | undefined,
  hasMeasuredBaseline: boolean,
): DailyPredictedBodyComposition | null {
  if (!prediction || !hasMeasuredBaseline) return null;

  const hasValue = [
    prediction.predictedWeightKg,
    prediction.predictedSkeletalMuscleKg,
    prediction.predictedBodyFatKg,
    prediction.predictedBodyFatPct,
  ].some(finite);

  if (!hasValue) return null;

  return {
    source: 'predicted',
    horizonDays: positiveFinite(prediction.horizonDays)
      ? Math.round(prediction.horizonDays)
      : null,
    predictedWeightKg: finite(prediction.predictedWeightKg)
      ? round(prediction.predictedWeightKg)
      : null,
    predictedSkeletalMuscleKg: finite(prediction.predictedSkeletalMuscleKg)
      ? round(prediction.predictedSkeletalMuscleKg)
      : null,
    predictedBodyFatKg: finite(prediction.predictedBodyFatKg)
      ? round(prediction.predictedBodyFatKg)
      : null,
    predictedBodyFatPct: finite(prediction.predictedBodyFatPct)
      ? round(prediction.predictedBodyFatPct)
      : null,
    confidence: prediction.confidence ?? null,
    modelVersion: prediction.modelVersion ?? null,
  };
}

function bodyCompositionNote(
  measured: DailyMeasuredBodyComposition | null,
  prediction: DailyPredictedBodyComposition | null,
): string | null {
  if (!measured && !prediction) return null;

  const measuredText = measured
    ? `최근 실제 측정은 체중 ${formatKg(measured.weightKg)}, 골격근량 ${formatKg(measured.skeletalMuscleKg)}, 체지방률 ${formatNumber(measured.bodyFatPct)}%예요.`
    : null;

  const predictionValues: string[] = [];
  if (prediction?.predictedWeightKg !== null && prediction?.predictedWeightKg !== undefined) {
    predictionValues.push(`체중 ${formatKg(prediction.predictedWeightKg)}`);
  }
  if (
    prediction?.predictedSkeletalMuscleKg !== null &&
    prediction?.predictedSkeletalMuscleKg !== undefined
  ) {
    predictionValues.push(`골격근량 ${formatKg(prediction.predictedSkeletalMuscleKg)}`);
  }
  if (
    prediction?.predictedBodyFatPct !== null &&
    prediction?.predictedBodyFatPct !== undefined
  ) {
    predictionValues.push(`체지방률 ${formatNumber(prediction.predictedBodyFatPct)}%`);
  }

  const predictionText = prediction && predictionValues.length > 0
    ? `${prediction.horizonDays ? `${prediction.horizonDays}일 후 ` : ''}예측은 ${predictionValues.join(', ')}예요. 예측값은 실제 측정값이 아니라 참고용 추정치예요.`
    : null;

  return [measuredText, predictionText].filter(Boolean).join(' ');
}

function finding(
  id: DailyCommentFindingId,
  tone: DailyCommentFindingTone,
  label: string,
  detail: string,
): DailyCommentFinding {
  return { id, tone, label, detail };
}

function hasMeaningfulDeficit(
  ratio: number | null,
  threshold: number,
): boolean {
  return ratio !== null && ratio < threshold;
}

function buildMainComment(
  nutrition: DailyCommentNutritionAnalysis,
  workout: DailyCommentWorkoutAnalysis,
  threshold: number,
): {
  comment: string;
  positivePoint: string | null;
  nextAction: string;
} {
  const didWorkout = workout.completedWorkoutCount > 0;
  const proteinLow =
    nutrition.status === 'recorded' &&
    hasMeaningfulDeficit(nutrition.targetRatios.protein_g, threshold);
  const kcalLow =
    nutrition.status === 'recorded' &&
    hasMeaningfulDeficit(nutrition.targetRatios.kcal, threshold);
  const limited = nutrition.status === 'partial';
  const hasTarget =
    nutrition.targetRatios.kcal !== null ||
    nutrition.targetRatios.protein_g !== null;
  const prefix = limited ? '기록된 식단 기준으로, ' : '';

  if (nutrition.status === 'missing') {
    return {
      comment: didWorkout
        ? '오늘 운동은 기록됐지만 식단 기록이 없어 회복 식사를 판단하기 어려워요.'
        : '오늘 식단 기록이 없어 섭취 상태를 판단하기 어려워요.',
      positivePoint: didWorkout ? '오늘 운동을 기록했어요.' : null,
      nextAction: '먹은 식사를 먼저 기록해 주세요.',
    };
  }

  if (nutrition.status === 'partial') {
    return {
      comment: didWorkout
        ? '오늘 운동은 기록됐어요. 식단 기록이 일부라 영양 균형은 아직 판단하기 어려워요.'
        : '오늘 식단 기록이 일부라 하루 섭취 균형은 아직 판단하기 어려워요.',
      positivePoint: didWorkout ? '오늘 운동을 기록했어요.' : '기록한 식사를 확인했어요.',
      nextAction: '남은 정규 식사도 기록해 하루 흐름을 완성해 주세요.',
    };
  }

  if (didWorkout && proteinLow && kcalLow) {
    return {
      comment: `${prefix}오늘 운동한 만큼 에너지와 단백질을 채우지 못한 하루였어요.`,
      positivePoint: '운동을 기록해 꾸준함을 이어갔어요.',
      nextAction: limited
        ? '빠진 식사가 있다면 먼저 기록한 뒤 섭취량을 다시 확인해 주세요.'
        : '내일은 운동 후 식사에 탄수화물과 단백질을 함께 챙겨 회복을 도와주세요.',
    };
  }

  if (didWorkout && proteinLow) {
    return {
      comment: `${prefix}운동한 거에 비해, 단백질이 부족한 하루였어요.`,
      positivePoint: '오늘 운동을 기록했어요.',
      nextAction: limited
        ? '빠진 식사가 있다면 먼저 기록한 뒤 단백질 섭취량을 다시 확인해 주세요.'
        : '내일은 평소 식사 한 끼에 단백질 식품을 추가해 보세요.',
    };
  }

  if (didWorkout && kcalLow) {
    return {
      comment: `${prefix}운동은 잘했지만, 회복을 위한 에너지가 조금 부족한 하루였어요.`,
      positivePoint: '운동을 기록해 활동량을 확인했어요.',
      nextAction: limited
        ? '빠진 식사가 있다면 먼저 기록한 뒤 에너지 섭취량을 다시 확인해 주세요.'
        : '내일은 운동 후 식사를 거르지 말고 평소 식사량을 챙겨 보세요.',
    };
  }

  if (didWorkout && !proteinLow && !kcalLow && hasTarget) {
    return {
      comment: limited
        ? '기록된 식단 기준으로 운동과 영양 섭취가 잘 맞은 하루예요.'
        : '오늘은 운동과 회복을 위한 영양 섭취가 잘 맞은 하루였어요.',
      positivePoint: '운동과 식단을 함께 기록했어요.',
      nextAction: limited
        ? '남은 식사도 기록해 오늘의 흐름을 완성해 주세요.'
        : '내일도 오늘처럼 운동 후 식사를 챙겨 보세요.',
    };
  }

  if (didWorkout && !hasTarget) {
    return {
      comment: limited
        ? '기록된 식단과 운동을 확인했어요. 목표가 없어 섭취 균형은 판단하기 어려워요.'
        : '오늘 식단과 운동을 기록했어요. 목표를 설정하면 섭취 균형을 더 구체적으로 볼 수 있어요.',
      positivePoint: '운동과 식단을 함께 기록했어요.',
      nextAction: limited
        ? '남은 식사와 개인 목표를 설정해 하루 기록을 완성해 주세요.'
        : '단백질과 열량 목표를 설정해 내일의 흐름을 비교해 보세요.',
    };
  }

  if (!proteinLow && !kcalLow && hasTarget) {
    return {
      comment: limited
        ? '기록된 식단 기준으로 오늘 섭취량은 목표 범위에 가까워요.'
        : '오늘 섭취량은 설정한 목표 범위에 가까운 하루였어요.',
      positivePoint: '식단을 기록해 섭취량을 확인했어요.',
      nextAction: limited
        ? '남은 식사도 기록해 하루 섭취량을 완성해 주세요.'
        : '내일도 현재 식사 흐름을 이어가 보세요.',
    };
  }

  if (!hasTarget) {
    return {
      comment: limited
        ? '기록된 식단을 확인했어요. 목표가 없어 섭취량을 비교하기는 어려워요.'
        : '오늘 식단을 기록했어요. 목표를 설정하면 섭취량을 더 구체적으로 확인할 수 있어요.',
      positivePoint: '식단을 기록해 섭취량을 확인했어요.',
      nextAction: limited
        ? '남은 식사와 개인 목표를 설정해 하루 기록을 완성해 주세요.'
        : '단백질과 열량 목표를 설정해 내일의 흐름을 비교해 보세요.',
    };
  }

  return {
    comment: `${prefix}오늘 섭취량이 설정한 목표보다 적은 편이에요.`,
    positivePoint: '식단을 기록해 섭취량을 확인했어요.',
    nextAction: limited
      ? '빠진 식사가 있다면 먼저 기록한 뒤 섭취량을 다시 확인해 주세요.'
      : '내일은 식사를 거르지 않고 평소 식사 흐름을 챙겨 보세요.',
  };
}

function buildEvidence(
  nutrition: DailyCommentNutritionAnalysis,
  workout: DailyCommentWorkoutAnalysis,
  bodyComposition: DailyCommentBodyCompositionAnalysis,
  threshold: number,
  predictionWasSupplied: boolean,
): DailyCommentFinding[] {
  const evidence: DailyCommentFinding[] = [];
  const didWorkout = workout.completedWorkoutCount > 0;

  if (didWorkout) {
    evidence.push(
      finding(
        'workout_completed',
        'positive',
        '운동 기록',
        `${workout.completedWorkoutCount}회, ${workout.completedSetCount}세트${workout.totalVolumeKg > 0 ? ` · 총 볼륨 ${formatNumber(workout.totalVolumeKg)}kg` : ''}`,
      ),
    );
  }

  if (nutrition.status === 'missing') {
    evidence.push(
      finding(
        'nutrition_missing',
        'neutral',
        '식단 기록 없음',
        '기록된 식단이 없어 섭취량과 목표 달성 여부를 판단하지 않았어요.',
      ),
    );
  } else if (nutrition.status === 'partial') {
    evidence.push(
      finding(
        'nutrition_partial',
        'attention',
        '식단 일부 기록',
        '현재 기록된 식사만으로 판단했어요. 빠진 식사가 있을 수 있어요.',
      ),
    );
  }

  if (
    nutrition.status === 'recorded' &&
    hasMeaningfulDeficit(nutrition.targetRatios.protein_g, threshold)
  ) {
    evidence.push(
      finding(
        'protein_below_target',
        'attention',
        '단백질 목표 미달',
        `단백질 ${formatNumber(nutrition.summary.protein_g)}g · 목표 ${formatNumber(nutrition.targets.protein_g ?? 0)}g`,
      ),
    );
  }

  if (
    nutrition.status === 'recorded' &&
    hasMeaningfulDeficit(nutrition.targetRatios.kcal, threshold)
  ) {
    evidence.push(
      finding(
        'kcal_below_target',
        'attention',
        '열량 목표 미달',
        `열량 ${formatNumber(nutrition.summary.kcal)}kcal · 목표 ${formatNumber(nutrition.targets.kcal ?? 0)}kcal`,
      ),
    );
  }

  if (
    nutrition.status === 'recorded' &&
    nutrition.targetRatios.kcal !== null &&
    nutrition.targetRatios.protein_g !== null &&
    nutrition.targetRatios.kcal >= threshold &&
    nutrition.targetRatios.protein_g >= threshold
  ) {
    evidence.push(
      finding(
        'nutrition_meets_targets',
        'positive',
        '영양 목표 범위',
        `기록된 열량과 단백질이 설정한 목표의 ${Math.round(threshold * 100)}% 이상이에요.`,
      ),
    );
  }

  if (bodyComposition.measured) {
    evidence.push(
      finding(
        'measured_body_composition',
        'neutral',
        '실제 측정 체성분',
        `${bodyComposition.measured.measuredAt} 측정 · 체중 ${formatKg(bodyComposition.measured.weightKg)} · 골격근량 ${formatKg(bodyComposition.measured.skeletalMuscleKg)} · 체지방률 ${formatNumber(bodyComposition.measured.bodyFatPct)}%`,
      ),
    );
  }

  if (bodyComposition.prediction) {
    evidence.push(
      finding(
        'predicted_body_composition',
        'neutral',
        '예측 체성분',
        `${bodyComposition.prediction.horizonDays ?? '향후'}일 시나리오이며 실제 측정값과 구분해 표시했어요.`,
      ),
    );
  } else if (predictionWasSupplied && bodyComposition.measured === null) {
    // This finding is useful to the UI only when a prediction was supplied
    // without a valid measurement baseline; no prediction is shown in that
    // case and no body composition value is asserted.
    evidence.push(
      finding(
        'prediction_without_measurement',
        'neutral',
        '예측 보류',
        '실제 측정 체성분이 없어 예측값을 하루 총평에 사용하지 않았어요.',
      ),
    );
  }

  return evidence;
}

/**
 * Build a deterministic, explainable daily coaching report.
 *
 * The function has no store, browser, clock, network, or model dependency.
 * It is safe to call from a server route, a client component, or a local
 * demo.  Numerical comparisons are made before any natural-language copy is
 * selected, so a future language model can be placed after this boundary
 * without changing the product rules.
 */
export function buildDailyComment(
  input: DailyCommentInput,
): DailyCommentReport {
  const targets: DailyCommentTargets = {
    kcal: validTarget(input.targets?.kcal),
    protein_g: validTarget(input.targets?.protein_g),
  };
  const threshold = validRatio(input.belowTargetRatio);
  const nutrition = analyzeNutrition(
    input.date,
    input.mealLogs,
    targets,
    input.mealRecordStatus,
  );
  const workout = analyzeWorkout(input.date, input.workoutLogs);
  const measured = measuredSnapshot(input.latestMeasuredBodyComposition);
  const prediction = predictionSnapshot(input.prediction, measured !== null);
  const bodyComposition: DailyCommentBodyCompositionAnalysis = {
    measured,
    prediction,
    note: bodyCompositionNote(measured, prediction),
  };
  const main = buildMainComment(nutrition, workout, threshold);

  return {
    date: input.date,
    status: nutrition.status === 'missing' || nutrition.status === 'partial'
      ? 'incomplete'
      : 'ready',
    comment: main.comment,
    positivePoint: main.positivePoint,
    nextAction: main.nextAction,
    evidence: buildEvidence(
      nutrition,
      workout,
      bodyComposition,
      threshold,
      Boolean(input.prediction),
    ),
    nutrition,
    workout,
    bodyComposition,
  };
}
