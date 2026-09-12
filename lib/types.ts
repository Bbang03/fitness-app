export type Sex = 'male' | 'female';

export interface StoredUser {
  id: string;
  email: string;
  password: string;
  name: string;
  height_cm: number;
  sex: Sex;
  birth_year: number;
  created_at: string;
  is_guest?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  height_cm: number;
  sex: Sex;
  birth_year: number;
  created_at: string;
}

export type RecordType =
  | 'weight_reps'
  | 'reps_only'
  | 'time';

export interface RoutineSetTarget {
  weight_kg: number;
  reps: number;
  duration_seconds: number;
}

export interface RoutineItem {
  id: string;

  order: number;

  exercise_name: string;

  // 목표 세트 수
  target_sets: number;

  // 하위 호환용 대표 목표값.
  // weight_reps / reps_only: 대표 반복 횟수
  // time: 대표 운동 시간(초)
  target_reps: number;

  // 하위 호환용 대표 목표 무게.
  // 세트별 실제 루틴 목표는 set_targets에 저장한다.
  target_weight_kg: number;

  // 세트별 루틴 목표값
  // 기존 데이터에서는 없을 수 있으므로 로딩 시 자동 보정한다.
  set_targets?: RoutineSetTarget[];

  // 세트 사이 휴식 시간(초)
  rest_seconds: number;

  // 운동 DB에서 결정되는 기록 방식
  record_type: RecordType;

  // 슈퍼세트 그룹
  superset_group?: string | null;
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  items: RoutineItem[];
  created_at: string;
}

export interface SetLog {
  id: string;

  workout_log_id: string;

  exercise_name: string;

  set_number: number;

  // 실제 수행 무게
  weight_kg: number;

  // 실제 수행 횟수
  reps: number;

  actual_rest_seconds: number;

  // 시간 기반 운동 실제 수행 시간(초)
  duration_seconds?: number;

  // 운동 당시 기록 방식
  record_type?: RecordType;
}

export interface WorkoutLog {
  id: string;

  user_id: string;

  routine_id: string;

  routine_name: string;

  date: string;

  started_at: string;

  finished_at: string | null;

  sets: SetLog[];
}

export type WorkoutPhase =
  | 'exercise'
  | 'rest'
  | 'complete';

export interface ActiveWorkout {
  workoutLogId: string;

  routineId: string;

  routineName: string;

  startedAt: string;

  exercises: RoutineItem[];

  phase: WorkoutPhase;

  currentExerciseIndex: number;

  currentSetIndex: number;

  completedSets: SetLog[];

  restTimer: {
    endTimestamp: number;
    totalSeconds: number;
  } | null;
}

// ── v0.2: 식단 ──────────────────────────────────────────────────────────────

export type MealType =
  | '아침'
  | '점심'
  | '저녁'
  | '간식';

export interface MealItem {
  id: string;

  meal_log_id: string;

  food_name: string;

  // 표시용 문자열
  // 예: "100g", "1공기"
  serving: string;

  kcal: number;

  carbs_g: number;

  protein_g: number;

  fat_g: number;
}

export interface MealLog {
  id: string;

  user_id: string;

  // YYYY-MM-DD
  date: string;

  meal_type: MealType;

  items: MealItem[];
}

export interface NutritionSummary {
  kcal: number;

  carbs_g: number;

  protein_g: number;

  fat_g: number;
}

export interface SignupData {
  email: string;

  password: string;

  name: string;

  height_cm: number;

  sex: Sex;

  birth_year: number;
}

// ── v0.3: 체성분 ─────────────────────────────────────────────────────────────

export interface InbodyRecord {
  id: string;

  user_id: string;

  // YYYY-MM-DD
  measured_at: string;

  // 체중 kg (필수)
  weight_kg: number;

  // 골격근량 kg (필수)
  skeletal_muscle_kg: number;

  // 체지방량 kg (필수, 자동계산)
  body_fat_kg: number;

  // 체지방률 % (필수)
  body_fat_pct: number;

  // 복부지방률 WHR (선택)
  abdominal_fat_ratio?: number;

  // 내장지방레벨 (선택)
  visceral_fat_level?: number;

  // 체수분 kg (선택)
  body_water_kg?: number;

  // 기초대사량 kcal (선택)
  bmr_kcal?: number;

  // 단백질 kg (선택)
  protein_kg?: number;

  // 무기질 kg (선택)
  mineral_kg?: number;
}

// ── v0.4: 체성분 예측 온보딩 ────────────────────────────────────────────────

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type PrimaryGoal =
  | 'fat_loss'
  | 'muscle_gain'
  | 'recomposition'
  | 'maintenance'
  | 'fitness';

export type DietExperience =
  | 'none'
  | 'beginner'
  | 'experienced';

export type TrainingConsistency =
  | 'irregular'
  | 'somewhat_consistent'
  | 'consistent';

export interface PredictionProfile {
  user_id: string;

  training_experience_months: number;

  recent_training_frequency: number;

  average_session_minutes: number;

  training_consistency: TrainingConsistency;

  activity_level: ActivityLevel;

  average_sleep_hours: number;

  primary_goal: PrimaryGoal;

  diet_experience: DietExperience;

  typical_meals_per_day: number;

  created_at: string;

  updated_at: string;
}

export type PredictionProfileInput =
  Omit<
    PredictionProfile,
    | 'user_id'
    | 'created_at'
    | 'updated_at'
  >;
