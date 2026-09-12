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

export type RecordType = 'weight_reps' | 'reps_only' | 'time';

export interface RoutineItem {
  id: string;
  order: number;
  exercise_name: string;
  target_sets: number;
  target_reps: number;      // doubles as target_seconds when record_type === 'time'
  rest_seconds: number;
  record_type: RecordType;  // defaults to 'weight_reps' for legacy items
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
  weight_kg: number;
  reps: number;
  actual_rest_seconds: number;
  duration_seconds?: number;  // for time-based exercises
  record_type?: RecordType;   // preserved for display
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

export type WorkoutPhase = 'exercise' | 'rest' | 'complete';

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

export type MealType = '아침' | '점심' | '저녁' | '간식';

export interface MealItem {
  id: string;
  meal_log_id: string;
  food_name: string;
  serving: string;       // 표시용 문자열 e.g. "100g", "1공기"
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
}

export interface MealLog {
  id: string;
  user_id: string;
  date: string;          // YYYY-MM-DD
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

// ── v0.3: 인바디 ─────────────────────────────────────────────────────────────

export interface InbodyRecord {
  id: string;
  user_id: string;
  measured_at: string;          // YYYY-MM-DD
  weight_kg: number;            // 체중 (필수)
  skeletal_muscle_kg: number;   // 골격근량 (필수)
  body_fat_kg: number;          // 체지방량 (필수, 자동계산)
  body_fat_pct: number;         // 체지방률 (필수)
  abdominal_fat_ratio?: number; // 복부지방률 WHR (선택)
  visceral_fat_level?: number;  // 내장지방레벨 (선택)
  body_water_kg?: number;       // 체수분 kg (선택)
  bmr_kcal?: number;            // 기초대사량 kcal (선택)
  protein_kg?: number;          // 단백질 kg (선택)
  mineral_kg?: number;          // 무기질 kg (선택)
}

// ── v0.4: 체성분 예측 온보딩 ────────────────────────────────────────────────

// 일상 활동 수준
export type ActivityLevel =
  | 'sedentary'      // 대부분 앉아서 생활
  | 'light'          // 가벼운 활동
  | 'moderate'       // 보통 수준의 활동
  | 'active'         // 활동적인 생활
  | 'very_active';   // 매우 활동적

// 현재 가장 중요한 운동 / 체성분 목표
export type PrimaryGoal =
  | 'fat_loss'       // 체지방 감량
  | 'muscle_gain'    // 근육 증가
  | 'recomposition'  // 체지방 감소 + 근육 증가
  | 'maintenance'    // 현재 체형 유지
  | 'fitness';       // 전반적인 체력 향상

// 식단 관리 경험
export type DietExperience =
  | 'none'
  | 'beginner'
  | 'experienced';

// 최근 운동의 규칙성
export type TrainingConsistency =
  | 'irregular'
  | 'somewhat_consistent'
  | 'consistent';

// Supabase prediction_profiles 테이블과 대응될 사용자 예측 프로필
export interface PredictionProfile {
  user_id: string;

  // 웨이트 트레이닝 누적 경험 개월 수
  // 예: 2년 → 24
  training_experience_months: number;

  // 최근 3개월 기준 평균 주당 운동 횟수
  // 예: 주 4회 → 4
  recent_training_frequency: number;

  // 한 번 운동할 때 평균 운동 시간
  // 단위: 분
  average_session_minutes: number;

  // 최근 운동 습관의 규칙성
  training_consistency: TrainingConsistency;

  // 운동 외 일상생활 활동 수준
  activity_level: ActivityLevel;

  // 평균 수면 시간
  // 단위: 시간
  average_sleep_hours: number;

  // 현재 주요 목표
  primary_goal: PrimaryGoal;

  // 칼로리 / 탄단지 관리 경험
  diet_experience: DietExperience;

  // 하루 평균 식사 횟수
  typical_meals_per_day: number;

  created_at: string;
  updated_at: string;
}

// 온보딩 화면에서 입력받을 때 사용하는 타입.
// user_id와 timestamp는 클라이언트 입력값이 아니므로 제외.
export type PredictionProfileInput = Omit<
  PredictionProfile,
  'user_id' | 'created_at' | 'updated_at'
>;