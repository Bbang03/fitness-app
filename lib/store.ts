import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  pendingExercise: { name: string; record_type: RecordType; targetIndex: number } | null;
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
  addRoutine: (name: string, items: Omit<RoutineItem, 'id'>[]) => string;
  updateRoutine: (id: string, name: string, items: Omit<RoutineItem, 'id'>[]) => void;
  deleteRoutine: (id: string) => void;

  // Exercise library
  toggleFavorite: (exerciseId: string) => void;
  setPendingExercise: (ex: { name: string; record_type: RecordType; targetIndex: number } | null) => void;

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

      // ── Routines ──────────────────────────────────────────────────────────

      addRoutine: (name, items) => {
        const user = get().currentUser();
        if (!user) return '';
        const routine: Routine = {
          id: generateId(),
          user_id: user.id,
          name,
          items: items.map((item, idx) => ({ ...item, id: generateId(), order: idx })),
          created_at: new Date().toISOString(),
        };
        set((s) => ({ routines: [...s.routines, routine] }));
        return routine.id;
      },

      updateRoutine: (id, name, items) => {
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id !== id
              ? r
              : {
                  ...r,
                  name,
                  items: items.map((item, idx) => ({ ...item, id: generateId(), order: idx })),
                },
          ),
        }));
      },

      deleteRoutine: (id) => {
        set((s) => ({
          routines: s.routines.filter((r) => r.id !== id),
          activeWorkout: s.activeWorkout?.routineId === id ? null : s.activeWorkout,
        }));
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
