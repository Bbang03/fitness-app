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
