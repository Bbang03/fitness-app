import { EXERCISE_DB, type BodyPart } from './exerciseData';
import type { WorkoutLog } from './types';

export type GuardianRegion = 'upper' | 'lower' | 'core' | 'cardio';
export type GuardianBalance =
  | 'sleeping'
  | 'forming'
  | 'balanced'
  | 'upper_dominant'
  | 'lower_dominant';

export interface GuardianProgress {
  upperPoints: number;
  lowerPoints: number;
  corePoints: number;
  cardioPoints: number;
  upperLevel: number;
  lowerLevel: number;
  coreLevel: number;
  overallLevel: number;
  overallProgress: number;
  pointsToNextLevel: number;
  balance: GuardianBalance;
  balanceRatio: number;
  completedWorkouts: number;
  totalCountedSets: number;
  message: string;
}

const REGION_LEVEL_THRESHOLDS = [0, 1, 8, 20, 40, 72] as const;
const OVERALL_LEVEL_THRESHOLDS = [0, 4, 20, 50, 100, 180] as const;
const MAX_SETS_PER_EXERCISE_PER_WORKOUT = 6;

const bodyPartByName = new Map(
  EXERCISE_DB.map((exercise) => [exercise.name, exercise.body_part]),
);

const upperParts = new Set<BodyPart>(['가슴', '등', '어깨', '삼두', '이두']);

function regionFromBodyPart(bodyPart: BodyPart): GuardianRegion {
  if (upperParts.has(bodyPart)) return 'upper';
  if (bodyPart === '하체') return 'lower';
  if (bodyPart === '복근') return 'core';
  return 'cardio';
}

function inferRegion(exerciseName: string): GuardianRegion | null {
  const bodyPart = bodyPartByName.get(exerciseName);
  if (bodyPart) return regionFromBodyPart(bodyPart);

  const name = exerciseName.toLowerCase().replace(/\s/g, '');
  if (/스쿼트|런지|레그|힙쓰러스트|카프|하체/.test(name)) return 'lower';
  if (/플랭크|크런치|싯업|복근|레그레이즈/.test(name)) return 'core';
  if (/달리기|러닝|걷기|사이클|자전거|로잉|유산소|줄넘기/.test(name)) return 'cardio';
  if (/벤치|푸시업|프레스|풀업|친업|로우|컬|딥스|어깨|가슴|등|이두|삼두/.test(name)) return 'upper';
  return null;
}

function levelFor(points: number, thresholds: readonly number[]) {
  let level = 0;
  thresholds.forEach((threshold, index) => {
    if (points >= threshold) level = index;
  });
  return level;
}

function nextLevelProgress(points: number, level: number) {
  if (level >= OVERALL_LEVEL_THRESHOLDS.length - 1) {
    return { progress: 100, remaining: 0 };
  }

  const floor = OVERALL_LEVEL_THRESHOLDS[level];
  const ceiling = OVERALL_LEVEL_THRESHOLDS[level + 1];
  return {
    progress: Math.round(((points - floor) / (ceiling - floor)) * 100),
    remaining: ceiling - points,
  };
}

export function buildGuardianProgress(logs: WorkoutLog[]): GuardianProgress {
  const points = { upper: 0, lower: 0, core: 0, cardio: 0 };
  const completedLogs = logs.filter((log) => Boolean(log.finished_at));

  for (const log of completedLogs) {
    const setsByExercise = new Map<string, number>();
    for (const set of log.sets) {
      setsByExercise.set(set.exercise_name, (setsByExercise.get(set.exercise_name) ?? 0) + 1);
    }

    for (const [exerciseName, count] of setsByExercise) {
      const region = inferRegion(exerciseName);
      if (!region) continue;
      points[region] += Math.min(count, MAX_SETS_PER_EXERCISE_PER_WORKOUT);
    }
  }

  const physiquePoints = points.upper + points.lower + points.core;
  const growthPoints = physiquePoints + points.cardio;
  const overallLevel = levelFor(growthPoints, OVERALL_LEVEL_THRESHOLDS);
  const next = nextLevelProgress(growthPoints, overallLevel);
  const largerSide = Math.max(points.upper, points.lower);
  const smallerSide = Math.min(points.upper, points.lower);
  const balanceRatio = largerSide === 0 ? 100 : Math.round((smallerSide / largerSide) * 100);

  let balance: GuardianBalance;
  let message: string;
  if (growthPoints === 0) {
    balance = 'sleeping';
    message = '첫 운동을 기록하면 돌 정령이 깨어나요.';
  } else if (points.upper + points.lower < 6) {
    balance = 'forming';
    message = '운동을 조금 더 기록하면 성장 방향이 보여요.';
  } else if (balanceRatio >= 75) {
    balance = 'balanced';
    message = '상체와 하체 블록이 고르게 자라고 있어요.';
  } else if (points.upper > points.lower) {
    balance = 'upper_dominant';
    message = '하체 운동을 더하면 정령의 중심이 단단해져요.';
  } else {
    balance = 'lower_dominant';
    message = '상체 운동을 더하면 정령의 형태가 균형을 찾아요.';
  }

  return {
    upperPoints: points.upper,
    lowerPoints: points.lower,
    corePoints: points.core,
    cardioPoints: points.cardio,
    upperLevel: levelFor(points.upper, REGION_LEVEL_THRESHOLDS),
    lowerLevel: levelFor(points.lower, REGION_LEVEL_THRESHOLDS),
    coreLevel: levelFor(points.core, REGION_LEVEL_THRESHOLDS),
    overallLevel,
    overallProgress: next.progress,
    pointsToNextLevel: next.remaining,
    balance,
    balanceRatio,
    completedWorkouts: completedLogs.length,
    totalCountedSets: points.upper + points.lower + points.core + points.cardio,
    message,
  };
}
