import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';
import {
  StoredUser, User, Routine, RoutineItem, WorkoutLog, SetLog,
  ActiveWorkout, SignupData, MealLog, MealItem, MealType, NutritionSummary,
  InbodyRecord, RecordType,
} from './types';
import { generateId } from './utils';

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
  startWorkout: (routineId: string) => void;
  logSet: (exerciseIndex: number, setIndex: number, weight: number, reps: number, duration_seconds?: number) => void;
  clearRestTimer: () => void;
  finishWorkout: () => void;
  cancelWorkout: () => void;

  // Meals (v0.2)
  addMealItem: (date: string, mealType: MealType, item: Omit<MealItem, 'id' | 'meal_log_id'>) => void;
  removeMealItem: (mealLogId: string, itemId: string) => void;
  deleteMealLog: (id: string) => void;
  getMealsByDate: (date: string) => MealLog[];
  getDailyNutrition: (date: string) => NutritionSummary;

  // InBody (v0.3)
  addInbodyRecord: (record: Omit<InbodyRecord, 'id' | 'user_id'>) => void;
  deleteInbodyRecord: (id: string) => void;
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
      setRoutines: (routines) => set({ routines }),

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
            items: items.map((item, idx) => ({
              ...item,
              id: generateId(),
              order: idx,
            })),
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
        const routineItems: RoutineItem[] = items.map((item, idx) => ({
          ...item,
          id: crypto.randomUUID(),
          order: idx,
        }));
      
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
              rest_seconds: item.rest_seconds,
              record_type: item.record_type,
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
                    items: items.map((item, idx) => ({
                      ...item,
                      id: generateId(),
                      order: idx,
                    })),
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
        const updatedItems: RoutineItem[] = items.map((item, idx) => ({
          ...item,
          id: crypto.randomUUID(),
          order: idx,
        }));
      
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
                rest_seconds: item.rest_seconds,
                record_type: item.record_type,
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
                    rest_seconds: item.rest_seconds,
                    record_type: item.record_type,
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

      startWorkout: (routineId) => {
        const routine = get().routines.find((r) => r.id === routineId);
        if (!routine) return;
        const sorted = [...routine.items].sort((a, b) => a.order - b.order);
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

      finishWorkout: () => {
        const { activeWorkout } = get();
        const user = get().currentUser();
        if (!activeWorkout || !user) return;

        const log: WorkoutLog = {
          id: activeWorkout.workoutLogId,
          user_id: user.id,
          routine_id: activeWorkout.routineId,
          routine_name: activeWorkout.routineName,
          date: new Date().toISOString().split('T')[0],
          started_at: activeWorkout.startedAt,
          finished_at: new Date().toISOString(),
          sets: activeWorkout.completedSets,
        };

        set((s) => ({
          workoutLogs: [log, ...s.workoutLogs],
          activeWorkout: null,
        }));
      },

      cancelWorkout: () => {
        set({ activeWorkout: null });
      },

      // ── Meals ──────────────────────────────────────────────────────────────

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

      addInbodyRecord: (record) => {
        const user = get().currentUser();
        if (!user) return;
        const newRecord: InbodyRecord = { ...record, id: generateId(), user_id: user.id };
        set((s) => ({
          inbodyRecords: [...s.inbodyRecords, newRecord].sort(
            (a, b) => a.measured_at.localeCompare(b.measured_at),
          ),
        }));
      },

      deleteInbodyRecord: (id) => {
        set((s) => ({ inbodyRecords: s.inbodyRecords.filter((r) => r.id !== id) }));
      },

      getInbodyRecords: () => {
        const user = get().currentUser();
        if (!user) return [];
        return get().inbodyRecords.filter((r) => r.user_id === user.id);
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
