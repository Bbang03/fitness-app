import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';
import {
  StoredUser, User, Routine, RoutineItem, WorkoutLog, SetLog,
  ActiveWorkout, SignupData, MealLog, MealItem, MealType, NutritionSummary,
  InbodyRecord, RecordType,
} from './types';
import { generateId } from './utils';

function normalizeRoutineItem(
  item: RoutineItem,
): RoutineItem {
  const recordType =
    item.record_type ??
    'weight_reps';

  const targetSets =
    Math.max(
      1,
      Number(
        item.target_sets ??
          3,
      ) || 3,
    );

  const fallbackReps =
    Math.max(
      1,
      Number(
        item.target_reps ??
          (recordType ===
          'time'
            ? 60
            : 10),
      ) ||
        (recordType ===
        'time'
          ? 60
          : 10),
    );

  const parsedWeight =
    Number(
      item.target_weight_kg ??
        0,
    );

  const fallbackWeight =
    recordType ===
      'weight_reps' &&
    Number.isFinite(
      parsedWeight,
    )
      ? Math.max(
          0,
          parsedWeight,
        )
      : 0;

  const sourceTargets =
    Array.isArray(
      item.set_targets,
    )
      ? item.set_targets
      : [];

  const setTargets =
    Array.from({
      length: targetSets,
    }).map(
      (_, index) => {
        const current =
          sourceTargets[
            index
          ];

        if (
          recordType ===
          'weight_reps'
        ) {
          const weight =
            Number(
              current?.weight_kg,
            );

          const reps =
            Number(
              current?.reps,
            );

          return {
            weight_kg:
              Number.isFinite(
                weight,
              )
                ? Math.max(
                    0,
                    weight,
                  )
                : fallbackWeight,

            reps:
              Number.isFinite(
                reps,
              )
                ? Math.max(
                    1,
                    Math.round(
                      reps,
                    ),
                  )
                : fallbackReps,

            duration_seconds: 0,
          };
        }

        if (
          recordType ===
          'reps_only'
        ) {
          const reps =
            Number(
              current?.reps,
            );

          return {
            weight_kg: 0,

            reps:
              Number.isFinite(
                reps,
              )
                ? Math.max(
                    1,
                    Math.round(
                      reps,
                    ),
                  )
                : fallbackReps,

            duration_seconds: 0,
          };
        }

        const duration =
          Number(
            current?.duration_seconds,
          );

        return {
          weight_kg: 0,
          reps: 0,
          duration_seconds:
            Number.isFinite(
              duration,
            )
              ? Math.max(
                  1,
                  Math.round(
                    duration,
                  ),
                )
              : fallbackReps,
        };
      },
    );

  const firstTarget =
    setTargets[0];

  return {
    ...item,

    target_sets:
      targetSets,

    record_type:
      recordType,

    target_weight_kg:
      recordType ===
      'weight_reps'
        ? firstTarget?.weight_kg ??
          fallbackWeight
        : 0,

    target_reps:
      recordType ===
      'time'
        ? firstTarget?.duration_seconds ??
          fallbackReps
        : firstTarget?.reps ??
          fallbackReps,

    set_targets:
      setTargets,

    superset_group:
      item.superset_group ??
      null,
  };
}

interface StoreState {
  // Auth
  users: StoredUser[];
  currentUserId: string | null;

  // Routines
  routines: Routine[];

  // Workout logs
  workoutLogs: WorkoutLog[];

  // Active workout (in-progress)
  activeWorkout: ActiveWorkout | null;

  // Meal logs (v0.2)
  mealLogs: MealLog[];

  // InBody records (v0.3)
  inbodyRecords: InbodyRecord[];

  // Exercise library
  favoriteExerciseIds: string[];
  pendingExercise: {
    name: string;
    record_type: RecordType;
    targetIndex: number;
  } | null;
  
  routineDraft: {
    name: string;
    items: Omit<RoutineItem, 'id'>[];
  } | null;

  editRoutineDraft: {
    routineId: string;
    name: string;
    items: Omit<RoutineItem, 'id'>[];
  } | null;
}

interface StoreActions {
  // Auth
 login: (email: string, password: string) => boolean;
 loginAsGuest: () => void;
 signup: (data: SignupData) => void;
 logout: () => void;
 currentUser: () => User | null;
 syncAuthenticatedUser: (user: StoredUser) => void;

  // Routines
  setRoutines: (routines: Routine[]) => void;
  
  addRoutine: (
    name: string,
    items: Omit<RoutineItem, 'id'>[],
  ) => Promise<string>;
  updateRoutine: (
    id: string,
    name: string,
    items: Omit<RoutineItem, 'id'>[],
  ) => Promise<boolean>;
  deleteRoutine: (id: string) => Promise<boolean>;

  // Exercise library
  toggleFavorite: (exerciseId: string) => void;
  setPendingExercise: (
    ex: {
      name: string;
      record_type: RecordType;
      targetIndex: number;
    } | null,
  ) => void;
  
  setRoutineDraft: (
    draft: {
      name: string;
      items: Omit<RoutineItem, 'id'>[];
    } | null,
  ) => void;
  
  clearRoutineDraft: () => void;

  setEditRoutineDraft: (
    draft: {
      routineId: string;
      name: string;
      items: Omit<RoutineItem, 'id'>[];
    } | null,
  ) => void;

  clearEditRoutineDraft: () => void;

  // Workout
  setWorkoutLogs: (logs: WorkoutLog[]) => void;

  startWorkout: (routineId: string) => void;
  logSet: (exerciseIndex: number, setIndex: number, weight: number, reps: number, duration_seconds?: number) => void;
  clearRestTimer: () => void;
  finishWorkout: () => Promise<boolean>;
  cancelWorkout: () => void;

  // Meals (v0.2)
  setMealLogs: (logs: MealLog[]) => void;
  
  addMealItem: (
    date: string,
    mealType: MealType,
    item: Omit<MealItem, 'id' | 'meal_log_id'>,
  ) => void;
  
  removeMealItem: (
    mealLogId: string,
    itemId: string,
  ) => void;
  
  deleteMealLog: (id: string) => void;
  
  getMealsByDate: (date: string) => MealLog[];
  
  getDailyNutrition: (
    date: string,
  ) => NutritionSummary;
  
  // InBody (v0.3)
  loadInbodyRecords: () => Promise<boolean>;
  addInbodyRecord: (
    record: Omit<InbodyRecord, 'id' | 'user_id'>,
  ) => Promise<boolean>;
  deleteInbodyRecord: (id: string) => Promise<boolean>;
  getInbodyRecords: () => InbodyRecord[];
}

type Store = StoreState & StoreActions;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      users: [],
      currentUserId: null,
      routines: [],
      workoutLogs: [],
      activeWorkout: null,
      mealLogs: [],
      inbodyRecords: [],
      favoriteExerciseIds: [],
      pendingExercise: null,
      routineDraft: null,
      editRoutineDraft: null,

      // ── Auth ──────────────────────────────────────────────────────────────

      syncAuthenticatedUser: (user) => {
        set((s) => ({
          users: [
            ...s.users.filter(
              (u) =>
                u.id !== user.id &&
                u.email.toLowerCase() !== user.email.toLowerCase(),
            ),
            user,
          ],
          currentUserId: user.id,
        }));
      },

      login: (email, password) => {
        const user = get().users.find(
          (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
        );
        if (!user) return false;
        set({ currentUserId: user.id });
        return true;
      },

      loginAsGuest: () => {
        const existing = get().users.find((u) => u.is_guest);
        if (existing) {
          set({ currentUserId: existing.id });
          return;
        }
        const guest: StoredUser = {
          id: generateId(),
          email: '',
          password: '',
          name: '비회원',
          height_cm: 170,
          sex: 'male',
          birth_year: new Date().getFullYear() - 25,
          created_at: new Date().toISOString(),
          is_guest: true,
        };
        set((s) => ({ users: [...s.users, guest], currentUserId: guest.id }));
      },

      signup: (data) => {
        const existing = get().users.find(
          (u) => u.email.toLowerCase() === data.email.toLowerCase(),
        );
        if (existing) return;
        const newUser: StoredUser = {
          id: generateId(),
          email: data.email,
          password: data.password,
          name: data.name,
          height_cm: data.height_cm,
          sex: data.sex,
          birth_year: data.birth_year,
          created_at: new Date().toISOString(),
        };
        set((s) => ({ users: [...s.users, newUser], currentUserId: newUser.id }));
      },

      logout: () => {
        set({ currentUserId: null, activeWorkout: null });
      },

      currentUser: () => {
        const { users, currentUserId } = get();
        if (!currentUserId) return null;
        const u = users.find((u) => u.id === currentUserId);
        if (!u) return null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _pw, ...rest } = u;
        return rest;
      },

      // ── Exercise library ──────────────────────────────────────────────────

      toggleFavorite: (exerciseId) => {
        set((s) => ({
          favoriteExerciseIds: s.favoriteExerciseIds.includes(exerciseId)
            ? s.favoriteExerciseIds.filter((id) => id !== exerciseId)
            : [...s.favoriteExerciseIds, exerciseId],
        }));
      },

      setPendingExercise: (ex) => set({ pendingExercise: ex }),

      setRoutineDraft: (draft) => set({ routineDraft: draft }),

      clearRoutineDraft: () => set({ routineDraft: null }),

      setEditRoutineDraft: (draft) => set({ editRoutineDraft: draft }),

      clearEditRoutineDraft: () => set({ editRoutineDraft: null }),

      // ── Routines ──────────────────────────────────────────────────────────
      setRoutines: (routines) =>
        set({
          routines:
            routines.map(
              (routine) => ({
                ...routine,

                items:
                  routine.items.map(
                    normalizeRoutineItem,
                  ),
              }),
            ),
        }),

      addRoutine: async (name, items) => {
        const user = get().currentUser();
        if (!user) return '';
        
        const storedUser = get().users.find((u) => u.id === user.id);
        
        // 비회원 모드는 기존 localStorage 방식 유지
        if (storedUser?.is_guest) {
          const routine: Routine = {
            id: generateId(),
            user_id: user.id,
            name,
            items: items.map(
              (item, idx) =>
                normalizeRoutineItem({
                  ...item,
                  id: generateId(),
                  order: idx,
                }),
            ),
            created_at: new Date().toISOString(),
          };
      
          set((s) => ({
            routines: [...s.routines, routine],
          }));
      
          return routine.id;
        }
      
        const supabase = createClient();
      
        const routineId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
      
        // 1. 루틴 본체 생성
        const { error: routineError } = await supabase
          .from('routines')
          .insert({
            id: routineId,
            user_id: user.id,
            name,
            created_at: createdAt,
          });
      
        if (routineError) {
          console.error('Routine insert failed:', routineError.message);
          return '';
        }
      
        // 2. 루틴 운동 항목 생성
        const routineItems: RoutineItem[] =
          items.map(
            (item, idx) =>
              normalizeRoutineItem({
                ...item,
                id: crypto.randomUUID(),
                order: idx,
              }),
          );
      
        const { error: itemsError } = await supabase
          .from('routine_items')
          .insert(
            routineItems.map((item) => ({
              id: item.id,
              routine_id: routineId,
              order: item.order,
              exercise_name: item.exercise_name,
              target_sets: item.target_sets,
              target_reps: item.target_reps,
              target_weight_kg:
                item.target_weight_kg,
              set_targets:
                item.set_targets ??
                [],
              rest_seconds: item.rest_seconds,
              record_type: item.record_type,
              superset_group:
                item.superset_group ??
                null,
            })),
          );
      
        if (itemsError) {
          console.error('Routine items insert failed:', itemsError.message);
      
          // 항목 저장 실패 시 이미 만든 부모 루틴도 제거
          await supabase
            .from('routines')
            .delete()
            .eq('id', routineId);
      
          return '';
        }
      
        // 3. Supabase 저장 성공 후 기존 UI와 호환되도록 Zustand에도 반영
        const routine: Routine = {
          id: routineId,
          user_id: user.id,
          name,
          items: routineItems,
          created_at: createdAt,
        };
      
        set((s) => ({
          routines: [...s.routines, routine],
        }));
      
        return routineId;
      },

      updateRoutine: async (id, name, items) => {
        const user = get().currentUser();
        if (!user) return false;
      
        const storedUser = get().users.find((u) => u.id === user.id);
      
        // 비회원은 기존 localStorage 방식 유지
        if (storedUser?.is_guest) {
          set((s) => ({
            routines: s.routines.map((r) =>
              r.id !== id
                ? r
                : {
                    ...r,
                    name,
                    items: items.map(
                      (item, idx) =>
                        normalizeRoutineItem({
                          ...item,
                          id: generateId(),
                          order: idx,
                        }),
                    ),
                  },
            ),
          }));
      
          return true;
        }
      
        const existingRoutine = get().routines.find(
          (r) => r.id === id && r.user_id === user.id,
        );
      
        if (!existingRoutine) return false;
      
        const supabase = createClient();
      
        // 1. 루틴 이름 수정
        const { error: routineError } = await supabase
          .from('routines')
          .update({ name })
          .eq('id', id)
          .eq('user_id', user.id);
      
        if (routineError) {
          console.error('Routine update failed:', routineError.message);
          return false;
        }
      
        // 2. 기존 운동 항목 제거
        const { error: deleteItemsError } = await supabase
          .from('routine_items')
          .delete()
          .eq('routine_id', id);
      
        if (deleteItemsError) {
          console.error(
            'Routine items delete failed:',
            deleteItemsError.message,
          );
      
          // 루틴 이름 원상 복구 시도
          await supabase
            .from('routines')
            .update({ name: existingRoutine.name })
            .eq('id', id)
            .eq('user_id', user.id);
      
          return false;
        }
      
        // 3. 수정된 운동 항목 생성
        const updatedItems: RoutineItem[] =
          items.map(
            (item, idx) =>
              normalizeRoutineItem({
                ...item,
                id: crypto.randomUUID(),
                order: idx,
              }),
          );
      
        if (updatedItems.length > 0) {
          const { error: insertItemsError } = await supabase
            .from('routine_items')
            .insert(
              updatedItems.map((item) => ({
                id: item.id,
                routine_id: id,
                order: item.order,
                exercise_name: item.exercise_name,
                target_sets: item.target_sets,
                target_reps: item.target_reps,
                target_weight_kg:
                  item.target_weight_kg,
                set_targets:
                  item.set_targets ??
                  [],
                rest_seconds: item.rest_seconds,
                record_type: item.record_type,
                superset_group:
                  item.superset_group ??
                  null,
              })),
            );
      
          if (insertItemsError) {
            console.error(
              'Routine items update failed:',
              insertItemsError.message,
            );
      
            // 실패했을 경우 기존 운동 항목 복구 시도
            if (existingRoutine.items.length > 0) {
              await supabase
                .from('routine_items')
                .insert(
                  existingRoutine.items.map((item) => ({
                    id: item.id,
                    routine_id: id,
                    order: item.order,
                    exercise_name: item.exercise_name,
                    target_sets: item.target_sets,
                    target_reps: item.target_reps,
                    target_weight_kg:
                      item.target_weight_kg ??
                      0,
                    set_targets:
                      item.set_targets ??
                      [],
                    rest_seconds: item.rest_seconds,
                    record_type:
                      item.record_type ??
                      'weight_reps',
                    superset_group:
                      item.superset_group ??
                      null,
                  })),
                );
            }
      
            await supabase
              .from('routines')
              .update({ name: existingRoutine.name })
              .eq('id', id)
              .eq('user_id', user.id);
      
            return false;
          }
        }
      
        // 4. Supabase 성공 후 Zustand도 갱신
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id !== id
              ? r
              : {
                  ...r,
                  name,
                  items: updatedItems,
                },
          ),
        }));
      
        return true;
      },
      
      deleteRoutine: async (id) => {
        const user = get().currentUser();
        if (!user) return false;
      
        const storedUser = get().users.find((u) => u.id === user.id);
      
        // 비회원은 기존 localStorage 방식 유지
        if (storedUser?.is_guest) {
          set((s) => ({
            routines: s.routines.filter((r) => r.id !== id),
            activeWorkout:
              s.activeWorkout?.routineId === id
                ? null
                : s.activeWorkout,
          }));
      
          return true;
        }
      
        const supabase = createClient();
      
        const { error } = await supabase
          .from('routines')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
      
        if (error) {
          console.error('Routine delete failed:', error.message);
          return false;
        }
      
        // Supabase 삭제 성공 후 Zustand에서도 제거
        set((s) => ({
          routines: s.routines.filter((r) => r.id !== id),
          activeWorkout:
            s.activeWorkout?.routineId === id
              ? null
              : s.activeWorkout,
        }));
      
        return true;
      },
      
      // ── Workout ───────────────────────────────────────────────────────────
      setWorkoutLogs: (logs) => set({ workoutLogs: logs }),

      startWorkout: (routineId) => {
        const routine = get().routines.find((r) => r.id === routineId);
        if (!routine) return;
        const sorted = [
          ...routine.items,
        ]
          .sort(
            (a, b) =>
              a.order -
              b.order,
          )
          .map(
            normalizeRoutineItem,
          );
        const workout: ActiveWorkout = {
          workoutLogId: generateId(),
          routineId,
          routineName: routine.name,
          startedAt: new Date().toISOString(),
          exercises: sorted,
          phase: 'exercise',
          currentExerciseIndex: 0,
          currentSetIndex: 0,
          completedSets: [],
          restTimer: null,
        };
        set({ activeWorkout: workout });
      },

      logSet: (exerciseIndex, setIndex, weight, reps, duration_seconds) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;

        const exercise = activeWorkout.exercises[exerciseIndex];
        const newSet: SetLog = {
          id: generateId(),
          workout_log_id: activeWorkout.workoutLogId,
          exercise_name: exercise.exercise_name,
          set_number: setIndex + 1,
          weight_kg: weight,
          reps,
          actual_rest_seconds: 0,
          duration_seconds,
          record_type: exercise.record_type ?? 'weight_reps',
        };

        const completedSets = [...activeWorkout.completedSets, newSet];
        const isLastSet = setIndex >= exercise.target_sets - 1;
        const isLastExercise = exerciseIndex >= activeWorkout.exercises.length - 1;

        if (isLastSet && isLastExercise) {
          set({
            activeWorkout: { ...activeWorkout, completedSets, phase: 'complete', restTimer: null },
          });
        } else if (isLastSet) {
          set({
            activeWorkout: {
              ...activeWorkout,
              completedSets,
              phase: 'exercise',
              currentExerciseIndex: exerciseIndex + 1,
              currentSetIndex: 0,
              restTimer: null,
            },
          });
        } else {
          const endTimestamp = Date.now() + exercise.rest_seconds * 1000;
          set({
            activeWorkout: {
              ...activeWorkout,
              completedSets,
              phase: 'rest',
              currentSetIndex: setIndex + 1,
              restTimer: { endTimestamp, totalSeconds: exercise.rest_seconds },
            },
          });
        }
      },

      clearRestTimer: () => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({ activeWorkout: { ...activeWorkout, phase: 'exercise', restTimer: null } });
      },

      finishWorkout: async () => {
        const { activeWorkout } = get();
        const user = get().currentUser();
      
        if (!activeWorkout || !user) return false;
      
        const storedUser = get().users.find((u) => u.id === user.id);
      
        const finishedAt = new Date().toISOString();
        const workoutDate = new Date().toLocaleDateString('en-CA');
      
        // 비회원은 기존 localStorage 방식 유지
        if (storedUser?.is_guest) {
          const log: WorkoutLog = {
            id: activeWorkout.workoutLogId,
            user_id: user.id,
            routine_id: activeWorkout.routineId,
            routine_name: activeWorkout.routineName,
            date: workoutDate,
            started_at: activeWorkout.startedAt,
            finished_at: finishedAt,
            sets: activeWorkout.completedSets,
          };
      
          set((s) => ({
            workoutLogs: [log, ...s.workoutLogs],
            activeWorkout: null,
          }));
      
          return true;
        }

        const supabase = createClient();
      
        // Supabase용 UUID 새로 생성
        const workoutLogId = crypto.randomUUID();
      
        // 1. 운동 기록 본체 저장
        const { error: workoutError } = await supabase
          .from('workout_logs')
          .insert({
            id: workoutLogId,
            user_id: user.id,
            routine_id: activeWorkout.routineId,
            routine_name: activeWorkout.routineName,
            date: workoutDate,
            started_at: activeWorkout.startedAt,
            finished_at: finishedAt,
          });
      
        if (workoutError) {
          console.error(
            'Workout log insert failed:',
            workoutError.message,
          );
          return false;
        }
      
        // 2. 완료한 세트들을 Supabase용 형태로 변환
        const persistedSets: SetLog[] =
          activeWorkout.completedSets.map((setLog) => ({
            ...setLog,
            id: crypto.randomUUID(),
            workout_log_id: workoutLogId,
            record_type: setLog.record_type ?? 'weight_reps',
          }));
      
        // 3. 세트 기록 저장
        if (persistedSets.length > 0) {
          const { error: setsError } = await supabase
            .from('set_logs')
            .insert(
              persistedSets.map((setLog) => ({
                id: setLog.id,
                workout_log_id: workoutLogId,
                exercise_name: setLog.exercise_name,
                set_number: setLog.set_number,
                weight_kg: setLog.weight_kg,
                reps: setLog.reps,
                actual_rest_seconds:
                  setLog.actual_rest_seconds ?? 0,
                duration_seconds:
                  setLog.duration_seconds ?? null,
                record_type:
                  setLog.record_type ?? 'weight_reps',
              })),
            );
      
          if (setsError) {
            console.error(
              'Set logs insert failed:',
              setsError.message,
            );
      
            // 세트 저장 실패 시 부모 workout_log도 제거
            await supabase
              .from('workout_logs')
              .delete()
              .eq('id', workoutLogId)
              .eq('user_id', user.id);
      
            return false;
          }
        }
      
        // 4. Supabase 저장 성공 후 Zustand에도 기록
        const log: WorkoutLog = {
          id: workoutLogId,
          user_id: user.id,
          routine_id: activeWorkout.routineId,
          routine_name: activeWorkout.routineName,
          date: workoutDate,
          started_at: activeWorkout.startedAt,
          finished_at: finishedAt,
          sets: persistedSets,
        };
      
        set((s) => ({
          workoutLogs: [log, ...s.workoutLogs],
          activeWorkout: null,
        }));
      
        return true;
      },

      cancelWorkout: () => {
        set({ activeWorkout: null });
      },

      // ── Meals ──────────────────────────────────────────────────────────────

      setMealLogs: (logs) =>
        set({
          mealLogs: logs,
        }),

      addMealItem: (date, mealType, item) => {
        const user = get().currentUser();
        if (!user) return;

        const existing = get().mealLogs.find(
          (l) => l.user_id === user.id && l.date === date && l.meal_type === mealType,
        );

        if (existing) {
          const newItem: MealItem = { ...item, id: generateId(), meal_log_id: existing.id };
          set((s) => ({
            mealLogs: s.mealLogs.map((l) =>
              l.id === existing.id ? { ...l, items: [...l.items, newItem] } : l,
            ),
          }));
        } else {
          const logId = generateId();
          const newItem: MealItem = { ...item, id: generateId(), meal_log_id: logId };
          const newLog: MealLog = {
            id: logId,
            user_id: user.id,
            date,
            meal_type: mealType,
            items: [newItem],
          };
          set((s) => ({ mealLogs: [...s.mealLogs, newLog] }));
        }
      },

      removeMealItem: (mealLogId, itemId) => {
        set((s) => ({
          mealLogs: s.mealLogs
            .map((l) =>
              l.id === mealLogId ? { ...l, items: l.items.filter((i) => i.id !== itemId) } : l,
            )
            .filter((l) => l.items.length > 0),
        }));
      },

      deleteMealLog: (id) => {
        set((s) => ({ mealLogs: s.mealLogs.filter((l) => l.id !== id) }));
      },

      getMealsByDate: (date) => {
        const user = get().currentUser();
        if (!user) return [];
        return get().mealLogs.filter((l) => l.user_id === user.id && l.date === date);
      },

      getDailyNutrition: (date) => {
        const meals = get().getMealsByDate(date);
        return meals.reduce<NutritionSummary>(
          (acc, log) => {
            log.items.forEach((item) => {
              acc.kcal += item.kcal;
              acc.carbs_g += item.carbs_g;
              acc.protein_g += item.protein_g;
              acc.fat_g += item.fat_g;
            });
            return acc;
          },
          { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 },
        );
      },

      // ── InBody ────────────────────────────────────────────────────────────

      loadInbodyRecords: async () => {
        const user = get().currentUser();
        if (!user) return false;

        const storedUser = get().users.find((u) => u.id === user.id);

        // 비회원은 기존 localStorage 기록을 그대로 사용
        if (storedUser?.is_guest) {
          return true;
        }

        const supabase = createClient();

        const { data, error } = await supabase
          .from('inbody_records')
          .select(`
            id,
            user_id,
            measured_at,
            weight_kg,
            skeletal_muscle_kg,
            body_fat_kg,
            body_fat_pct,
            abdominal_fat_ratio,
            visceral_fat_level,
            body_water_kg,
            bmr_kcal,
            protein_kg,
            mineral_kg
          `)
          .eq('user_id', user.id)
          .order('measured_at', { ascending: true });

        if (error) {
          console.error('InBody records load failed:', error.message);
          return false;
        }

        const hydratedRecords: InbodyRecord[] = (data ?? []).map((row) => ({
          id: row.id,
          user_id: row.user_id,
          measured_at: row.measured_at,
          weight_kg: Number(row.weight_kg),
          skeletal_muscle_kg: Number(row.skeletal_muscle_kg),
          body_fat_kg: Number(row.body_fat_kg),
          body_fat_pct: Number(row.body_fat_pct),
          ...(row.abdominal_fat_ratio !== null
            ? { abdominal_fat_ratio: Number(row.abdominal_fat_ratio) }
            : {}),
          ...(row.visceral_fat_level !== null
            ? { visceral_fat_level: Number(row.visceral_fat_level) }
            : {}),
          ...(row.body_water_kg !== null
            ? { body_water_kg: Number(row.body_water_kg) }
            : {}),
          ...(row.bmr_kcal !== null
            ? { bmr_kcal: Number(row.bmr_kcal) }
            : {}),
          ...(row.protein_kg !== null
            ? { protein_kg: Number(row.protein_kg) }
            : {}),
          ...(row.mineral_kg !== null
            ? { mineral_kg: Number(row.mineral_kg) }
            : {}),
        }));

        set((s) => ({
          inbodyRecords: [
            ...s.inbodyRecords.filter((record) => record.user_id !== user.id),
            ...hydratedRecords,
          ].sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
        }));

        return true;
      },

      addInbodyRecord: async (record) => {
        const user = get().currentUser();
        if (!user) return false;

        const storedUser = get().users.find((u) => u.id === user.id);

        // 비회원은 기존 localStorage 방식 유지
        if (storedUser?.is_guest) {
          const newRecord: InbodyRecord = {
            ...record,
            id: generateId(),
            user_id: user.id,
          };

          set((s) => ({
            inbodyRecords: [...s.inbodyRecords, newRecord].sort(
              (a, b) => a.measured_at.localeCompare(b.measured_at),
            ),
          }));

          return true;
        }

        const supabase = createClient();
        const id = crypto.randomUUID();

        const { error } = await supabase
          .from('inbody_records')
          .insert({
            id,
            user_id: user.id,
            measured_at: record.measured_at,
            weight_kg: record.weight_kg,
            skeletal_muscle_kg: record.skeletal_muscle_kg,
            body_fat_kg: record.body_fat_kg,
            body_fat_pct: record.body_fat_pct,
            abdominal_fat_ratio: record.abdominal_fat_ratio ?? null,
            visceral_fat_level: record.visceral_fat_level ?? null,
            body_water_kg: record.body_water_kg ?? null,
            bmr_kcal: record.bmr_kcal ?? null,
            protein_kg: record.protein_kg ?? null,
            mineral_kg: record.mineral_kg ?? null,
          });

        if (error) {
          console.error('InBody record insert failed:', error.message);
          return false;
        }

        const newRecord: InbodyRecord = {
          ...record,
          id,
          user_id: user.id,
        };

        set((s) => ({
          inbodyRecords: [
            ...s.inbodyRecords.filter((existing) => existing.id !== id),
            newRecord,
          ].sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
        }));

        return true;
      },

      deleteInbodyRecord: async (id) => {
        const user = get().currentUser();
        if (!user) return false;

        const storedUser = get().users.find((u) => u.id === user.id);

        // 비회원은 기존 localStorage 방식 유지
        if (storedUser?.is_guest) {
          set((s) => ({
            inbodyRecords: s.inbodyRecords.filter((record) => record.id !== id),
          }));

          return true;
        }

        const supabase = createClient();

        const { error } = await supabase
          .from('inbody_records')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);

        if (error) {
          console.error('InBody record delete failed:', error.message);
          return false;
        }

        set((s) => ({
          inbodyRecords: s.inbodyRecords.filter((record) => record.id !== id),
        }));

        return true;
      },

      getInbodyRecords: () => {
        const user = get().currentUser();
        if (!user) return [];

        return get()
          .inbodyRecords
          .filter((record) => record.user_id === user.id)
          .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
      },
    }),
    {
      name: 'fittrack-store',
      partialize: (s) => ({
        users: s.users,
        currentUserId: s.currentUserId,
        routines: s.routines,
        workoutLogs: s.workoutLogs,
        activeWorkout: s.activeWorkout,
        mealLogs: s.mealLogs,
        inbodyRecords: s.inbodyRecords,
        favoriteExerciseIds: s.favoriteExerciseIds,
      }),
    },
  ),
);
