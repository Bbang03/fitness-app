/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4
 * genre: playful · macrostructure: Workbench · tone: quiet tactile
 * anchor hue: forest-green · contrast: pass · responsive: pass
 */
'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Camera,
  ChevronRight,
  Dumbbell,
  Flame,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  UtensilsCrossed,
} from 'lucide-react';

import AppShell from '@/components/AppShell';
import ActivityCalendar from '@/components/dashboard/ActivityCalendar';
import GuardianProgressCard from '@/components/GuardianProgressCard';

import {
  buildGuardianProgress,
} from '@/lib/guardianProgress';

import {
  predict,
} from '@/lib/prediction';

import {
  buildCalendarDaySummaries,
  type CalendarNutritionGoals,
} from '@/lib/calendarSummary';

import {
  useStore,
} from '@/lib/store';

import {
  createClient,
} from '@/lib/supabase/client';

import {
  calcTotalVolume,
  formatDate,
} from '@/lib/utils';

import type {
  MealLog,
  MealType,
  Routine,
  WorkoutLog,
} from '@/lib/types';


function localDateKey(
  date = new Date(),
) {
  return date.toLocaleDateString(
    'en-CA',
  );
}


function daysAgoKey(
  days: number,
) {
  const date =
    new Date();

  date.setDate(
    date.getDate() -
      days,
  );

  return localDateKey(
    date,
  );
}


function roundOne(
  value: number,
) {
  return (
    Math.round(
      value * 10,
    ) / 10
  );
}


function signed(
  value: number,
  unit: string,
) {
  const prefix =
    value > 0
      ? '+'
      : '';

  return `${prefix}${value.toFixed(
    1,
  )}${unit}`;
}


export default function DashboardPage() {
  const router =
    useRouter();

  const {
    users,
    currentUser,

    routines,
    setRoutines,

    workoutLogs,
    setWorkoutLogs,

    mealLogs,
    setMealLogs,

    logout,
    activeWorkout,

    loadInbodyRecords,
    getDailyNutrition,
    getInbodyRecords,
  } = useStore();

  const [isLoading, setIsLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState('');

  const [reloadKey, setReloadKey] =
    useState(0);

  const user =
    currentUser();

  const storedUser =
    user
      ? users.find(
          (
            item,
          ) =>
            item.id ===
            user.id,
        ) ?? null
      : null;

  const isGuest =
    Boolean(
      storedUser?.is_guest,
    );

  // ─────────────────────────────────────────────
  // Auth guard
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      router.replace(
        '/login',
      );
    }
  }, [
    user?.id,
    router,
  ]);

  // ─────────────────────────────────────────────
  // Dashboard hydration
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled =
      false;

    const userId =
      user.id;

    const loadDashboardData =
      async () => {
        setIsLoading(
          true,
        );

        setLoadError('');

        try {
          /*
           * Guest는 기존 localStorage/Zustand 데이터를 그대로 사용한다.
           * InBody loader도 guest에서는 local state를 보존한다.
           */
          if (isGuest) {
            await loadInbodyRecords();

            return;
          }

          const supabase =
            createClient();

          const {
            data:
              authData,
            error:
              authError,
          } =
            await supabase.auth.getUser();

          if (
            authError ||
            !authData.user
          ) {
            throw new Error(
              '로그인 상태를 확인할 수 없습니다.',
            );
          }

          const [
            routinesResult,
            workoutLogsResult,
            mealLogsResult,
            inbodyLoaded,
          ] =
            await Promise.all([
              supabase
                .from(
                  'routines',
                )
                .select(`
                  id,
                  user_id,
                  name,
                  created_at,
                  routine_items (
                    id,
                    order,
                    exercise_name,
                    target_sets,
                    target_reps,
                    target_weight_kg,
                    set_targets,
                    rest_seconds,
                    record_type,
                    superset_group
                  )
                `)
                .eq(
                  'user_id',
                  userId,
                )
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  },
                ),

              supabase
                .from(
                  'workout_logs',
                )
                .select(`
                  id,
                  user_id,
                  routine_id,
                  routine_name,
                  date,
                  started_at,
                  finished_at,
                  set_logs (
                    id,
                    workout_log_id,
                    exercise_name,
                    set_number,
                    weight_kg,
                    reps,
                    actual_rest_seconds,
                    duration_seconds,
                    record_type
                  )
                `)
                .eq(
                  'user_id',
                  userId,
                )
                .order(
                  'started_at',
                  {
                    ascending:
                      false,
                  },
                ),

              supabase
                .from(
                  'meal_logs',
                )
                .select(`
                  id,
                  user_id,
                  date,
                  meal_type,
                  meal_items (
                    id,
                    meal_log_id,
                    food_name,
                    serving,
                    kcal,
                    carbs_g,
                    protein_g,
                    fat_g
                  )
                `)
                .eq(
                  'user_id',
                  userId,
                )
                .order(
                  'date',
                  {
                    ascending:
                      false,
                  },
                ),

              loadInbodyRecords(),
            ]);

          if (cancelled) {
            return;
          }

          const errors:
            string[] = [];

          // Routines
          if (
            routinesResult.error
          ) {
            console.error(
              'Dashboard routines load failed:',
              routinesResult.error
                .message,
            );

            errors.push(
              '운동 루틴',
            );
          } else {
            const loadedRoutines:
              Routine[] =
              (
                routinesResult.data ??
                []
              ).map(
                (
                  routine,
                ) => ({
                  id:
                    routine.id,

                  user_id:
                    routine.user_id,

                  name:
                    routine.name,

                  created_at:
                    routine.created_at,

                  items: [
                    ...(
                      routine.routine_items ??
                      []
                    ),
                  ]
                    .sort(
                      (
                        a,
                        b,
                      ) =>
                        a.order -
                        b.order,
                    )
                    .map(
                      (
                        item,
                        index,
                      ) => {
                        const recordType =
                          item.record_type ===
                            'reps_only' ||
                          item.record_type ===
                            'time'
                            ? item.record_type
                            : 'weight_reps';

                        return {
                          id:
                            item.id,

                          order:
                            Number.isFinite(
                              Number(
                                item.order,
                              ),
                            )
                              ? Number(
                                  item.order,
                                )
                              : index,

                          exercise_name:
                            item.exercise_name,

                          target_sets:
                            Math.max(
                              1,
                              Number(
                                item.target_sets ??
                                  3,
                              ),
                            ),

                          target_reps:
                            Math.max(
                              1,
                              Number(
                                item.target_reps ??
                                  (
                                    recordType ===
                                    'time'
                                      ? 60
                                      : 10
                                  ),
                              ),
                            ),

                          target_weight_kg:
                            recordType ===
                            'weight_reps'
                              ? Math.max(
                                  0,
                                  Number(
                                    item.target_weight_kg ??
                                      0,
                                  ),
                                )
                              : 0,

                          set_targets:
                            Array.isArray(
                              item.set_targets,
                            )
                              ? item.set_targets
                              : [],

                          rest_seconds:
                            Math.max(
                              0,
                              Number(
                                item.rest_seconds ??
                                  90,
                              ),
                            ),

                          record_type:
                            recordType,

                          superset_group:
                            item.superset_group ??
                            null,
                        };
                      },
                    ),
                }),
              );

            setRoutines(
              loadedRoutines,
            );
          }

          // Workout logs
          if (
            workoutLogsResult.error
          ) {
            console.error(
              'Dashboard workout logs load failed:',
              workoutLogsResult.error
                .message,
            );

            errors.push(
              '운동 기록',
            );
          } else {
            const loadedWorkoutLogs:
              WorkoutLog[] =
              (
                workoutLogsResult.data ??
                []
              ).map(
                (
                  log,
                ) => ({
                  id:
                    log.id,

                  user_id:
                    log.user_id,

                  routine_id:
                    log.routine_id ??
                    '',

                  routine_name:
                    log.routine_name ??
                    '',

                  date:
                    log.date,

                  started_at:
                    log.started_at,

                  finished_at:
                    log.finished_at,

                  sets: [
                    ...(
                      log.set_logs ??
                      []
                    ),
                  ].sort(
                    (
                      a,
                      b,
                    ) =>
                      a.set_number -
                      b.set_number,
                  ),
                }),
              );

            setWorkoutLogs(
              loadedWorkoutLogs,
            );
          }

          // Meal logs
          if (
            mealLogsResult.error
          ) {
            console.error(
              'Dashboard meal logs load failed:',
              mealLogsResult.error
                .message,
            );

            errors.push(
              '식단 기록',
            );
          } else {
            const loadedMealLogs:
              MealLog[] =
              (
                mealLogsResult.data ??
                []
              ).map(
                (
                  log,
                ) => ({
                  id:
                    log.id,

                  user_id:
                    log.user_id,

                  date:
                    log.date,

                  meal_type:
                    log.meal_type as
                      MealType,

                  items:
                    (
                      log.meal_items ??
                      []
                    ).map(
                      (
                        item,
                      ) => ({
                        id:
                          item.id,

                        meal_log_id:
                          item.meal_log_id,

                        food_name:
                          item.food_name,

                        serving:
                          item.serving ??
                          '',

                        kcal:
                          Number(
                            item.kcal,
                          ),

                        carbs_g:
                          Number(
                            item.carbs_g,
                          ),

                        protein_g:
                          Number(
                            item.protein_g,
                          ),

                        fat_g:
                          Number(
                            item.fat_g,
                          ),
                      }),
                    ),
                }),
              );

            setMealLogs(
              loadedMealLogs,
            );
          }

          if (!inbodyLoaded) {
            errors.push(
              '체성분 기록',
            );
          }

          if (
            errors.length >
            0
          ) {
            setLoadError(
              `${errors.join(
                ', ',
              )} 일부를 불러오지 못했어요.`,
            );
          }
        } catch (error) {
          console.error(
            'Dashboard load failed:',
            error,
          );

          if (!cancelled) {
            setLoadError(
              error instanceof
                Error
                ? error.message
                : '최신 데이터를 불러오지 못했어요.',
            );
          }
        } finally {
          if (!cancelled) {
            setIsLoading(
              false,
            );
          }
        }
      };

    void loadDashboardData();

    return () => {
      cancelled =
        true;
    };
  }, [
    user?.id,
    isGuest,
    reloadKey,
    setRoutines,
    setWorkoutLogs,
    setMealLogs,
    loadInbodyRecords,
  ]);

  // ─────────────────────────────────────────────
  // Derived data
  // Hooks are intentionally above the early return.
  // ─────────────────────────────────────────────

  const myRoutines =
    useMemo(
      () =>
        user
          ? routines
              .filter(
                (
                  routine,
                ) =>
                  routine.user_id ===
                  user.id,
              )
              .sort(
                (
                  a,
                  b,
                ) =>
                  new Date(
                    b.created_at,
                  ).getTime() -
                  new Date(
                    a.created_at,
                  ).getTime(),
              )
          : [],
      [
        routines,
        user?.id,
      ],
    );

  const myLogs =
    useMemo(
      () =>
        user
          ? workoutLogs
              .filter(
                (
                  log,
                ) =>
                  log.user_id ===
                  user.id,
              )
              .sort(
                (
                  a,
                  b,
                ) =>
                  new Date(
                    b.started_at,
                  ).getTime() -
                  new Date(
                    a.started_at,
                  ).getTime(),
              )
          : [],
      [
        workoutLogs,
        user?.id,
      ],
    );

  const myMealLogs =
    useMemo(
      () =>
        user
          ? mealLogs.filter(
              (
                log,
              ) =>
                log.user_id ===
                user.id,
            )
          : [],
      [
        mealLogs,
        user?.id,
      ],
    );

  const guardianProgress =
    useMemo(
      () =>
        buildGuardianProgress(
          myLogs,
        ),
      [myLogs],
    );

  const weekLogs =
    useMemo(
      () => {
        const now =
          new Date();

        return myLogs.filter(
          (
            log,
          ) => {
            const workoutDate =
              new Date(
                log.started_at,
              );

            const diffDays =
              (
                now.getTime() -
                workoutDate.getTime()
              ) /
              (
                1000 *
                60 *
                60 *
                24
              );

            return (
              diffDays >=
                0 &&
              diffDays <=
                7
            );
          },
        );
      },
      [
        myLogs,
      ],
    );

  const recentNutrition =
    useMemo(
      () => {
        const cutoff =
          daysAgoKey(
            29,
          );

        const recent =
          myMealLogs.filter(
            (
              log,
            ) =>
              log.date >=
              cutoff,
          );

        const byDate =
          new Map<
            string,
            {
              kcal: number;
              protein: number;
            }
          >();

        for (
          const log
          of recent
        ) {
          const summary =
            byDate.get(
              log.date,
            ) ?? {
              kcal: 0,
              protein: 0,
            };

          for (
            const item
            of log.items
          ) {
            summary.kcal +=
              item.kcal;

            summary.protein +=
              item.protein_g;
          }

          byDate.set(
            log.date,
            summary,
          );
        }

        if (
          byDate.size ===
          0
        ) {
          return {
            avgKcal: 0,
            avgProtein: 0,
            recordedDays: 0,
          };
        }

        let kcal = 0;
        let protein = 0;

        for (
          const summary
          of byDate.values()
        ) {
          kcal +=
            summary.kcal;

          protein +=
            summary.protein;
        }

        return {
          avgKcal:
            kcal /
            byDate.size,

          avgProtein:
            protein /
            byDate.size,

          recordedDays:
            byDate.size,
        };
      },
      [
        myMealLogs,
      ],
    );

  const calendarToday =
    localDateKey();

  const calendarInbodyRecords =
    getInbodyRecords();

  const calendarGoals:
    CalendarNutritionGoals =
    useMemo(
      () => {
        const latestRecord =
          calendarInbodyRecords.at(
            -1,
          ) ?? null;

        if (
          !user ||
          !latestRecord
        ) {
          return {
            kcal: null,
            protein_g: null,
          };
        }

        const calendarPrediction =
          predict({
            user: {
              height_cm:
                user.height_cm,

              sex:
                user.sex,

              birth_year:
                user.birth_year,
            },

            latestInbody:
              latestRecord,

            avgDailyKcal:
              recentNutrition
                .avgKcal,

            avgDailyProtein_g:
              recentNutrition
                .avgProtein,

            weeklyVolume_kg:
              weekLogs.reduce(
                (
                  total,
                  log,
                ) =>
                  total +
                  calcTotalVolume(
                    log.sets,
                  ),
                0,
              ),

            days: 30,
          });

        return {
          kcal:
            calendarPrediction
              ?.tdee ??
            null,

          protein_g:
            latestRecord.weight_kg *
            1.6,
        };
      },
      [
        calendarInbodyRecords,
        recentNutrition.avgKcal,
        recentNutrition.avgProtein,
        user?.birth_year,
        user?.height_cm,
        user?.id,
        user?.sex,
        weekLogs,
      ],
    );

  const calendarSummaries =
    useMemo(
      () =>
        buildCalendarDaySummaries(
          myLogs,
          myMealLogs,
          calendarGoals,
          {
            today:
              calendarToday,
          },
        ),
      [
        calendarGoals,
        calendarToday,
        myLogs,
        myMealLogs,
      ],
    );

  if (!user) {
    return null;
  }

  // ─────────────────────────────────────────────
  // Non-hook derived data
  // ─────────────────────────────────────────────

  const todayKey =
    calendarToday;

  const todayNutrition =
    getDailyNutrition(
      todayKey,
    );

  const todayMeals =
    myMealLogs.filter(
      (
        log,
      ) =>
        log.date ===
        todayKey &&
        log.meal_type !== '간식' &&
        log.items.length >
          0,
    );

  const todayMealCount =
    new Set(
      todayMeals.map(
        (
          log,
        ) =>
          log.meal_type,
      ),
    ).size;

  const todayWorkoutCount =
    myLogs.filter(
      (
        log,
      ) =>
        log.date ===
        todayKey,
    ).length;

  const inbodyRecords =
    calendarInbodyRecords;

  const latestInbody =
    inbodyRecords.at(
      -1,
    ) ?? null;

  const previousInbody =
    inbodyRecords.length >=
    2
      ? inbodyRecords.at(
          -2,
        ) ?? null
      : null;

  const weeklyVolume =
    weekLogs.reduce(
      (
        total,
        log,
      ) =>
        total +
        calcTotalVolume(
          log.sets,
        ),
      0,
    );

  const prediction =
    latestInbody
      ? predict({
          user: {
            height_cm:
              user.height_cm,

            sex:
              user.sex,

            birth_year:
              user.birth_year,
          },

          latestInbody:
            latestInbody,

          avgDailyKcal:
            recentNutrition
              .avgKcal,

          avgDailyProtein_g:
            recentNutrition
              .avgProtein,

          weeklyVolume_kg:
            weeklyVolume,

          days:
            30,
        })
      : null;

  const proteinGoal =
    latestInbody
      ? latestInbody.weight_kg *
        1.6
      : null;

  const proteinProgress =
    proteinGoal
      ? Math.min(
          100,
          Math.round(
            (
              todayNutrition
                .protein_g /
              proteinGoal
            ) *
              100,
          ),
        )
      : null;

  const kcalReference =
    prediction?.tdee ??
    null;

  const kcalProgress =
    kcalReference
      ? Math.min(
          100,
          Math.round(
            (
              todayNutrition.kcal /
              kcalReference
            ) *
              100,
          ),
        )
      : null;

  const weightDelta =
    latestInbody &&
    previousInbody
      ? latestInbody.weight_kg -
        previousInbody.weight_kg
      : null;

  const muscleDelta =
    latestInbody &&
    previousInbody
      ? latestInbody
          .skeletal_muscle_kg -
        previousInbody
          .skeletal_muscle_kg
      : null;

  const fatDelta =
    latestInbody &&
    previousInbody
      ? latestInbody.body_fat_pct -
        previousInbody.body_fat_pct
      : null;

  const recentLogs =
    myLogs.slice(
      0,
      3,
    );

  const todayLabel =
    new Intl.DateTimeFormat(
      'ko-KR',
      {
        month:
          'long',
        day:
          'numeric',
        weekday:
          'short',
      },
    ).format(
      new Date(),
    );

  const greeting =
    (() => {
      const hour =
        new Date().getHours();

      if (hour < 11) {
        return '좋은 아침이에요';
      }

      if (hour < 18) {
        return '좋은 오후예요';
      }

      return '좋은 저녁이에요';
    })();

  const aiDescription =
    (() => {
      if (!latestInbody) {
        return (
          '첫 체성분 기록을 추가하면 운동·식단 기록과 함께 30일 후 변화를 분석할 수 있어요.'
        );
      }

      if (!prediction) {
        return (
          '체성분 변화 예측을 준비하고 있어요.'
        );
      }

      if (
        recentNutrition
          .recordedDays ===
          0 &&
        weekLogs.length ===
          0
      ) {
        return (
          '최근 운동·식단 기록이 부족해 현재 체성분을 중심으로 보수적으로 예측하고 있어요.'
        );
      }

      return (
        `현재 기록 패턴 기준 30일 후 체중 ${prediction.predictedWeight_kg}kg, ` +
        `골격근량 ${prediction.predictedSkeletal_kg}kg, ` +
        `체지방률 ${prediction.predictedBodyFatPct}%로 예상돼요.`
      );
    })();

  // ─────────────────────────────────────────────
  // Logout
  // ─────────────────────────────────────────────

  const handleLogout =
    async () => {
      if (!isGuest) {
        const supabase =
          createClient();

        const {
          error,
        } =
          await supabase.auth.signOut({
            scope:
              'local',
          });

        if (error) {
          console.error(
            'Logout failed:',
            error.message,
          );

          return;
        }
      }

      logout();

      router.replace(
        '/login',
      );
    };

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────

  return (
    <AppShell>
      <main className="apple-page-header">
        <GuardianProgressCard progress={guardianProgress} />

        <section className="mt-6" aria-label="오늘의 식단과 섭취량">
          <Link href="/meals" className="apple-card block p-5">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-500">오늘 섭취</p>
                <p className="mt-1 whitespace-nowrap text-[2.5rem] font-bold leading-none tracking-[-0.045em] text-zinc-900">
                  {Math.round(todayNutrition.kcal).toLocaleString()}
                  <span className="ml-1.5 text-sm font-semibold tracking-normal text-zinc-500">kcal</span>
                </p>
              </div>
              <span className="whitespace-nowrap text-xs font-semibold text-blue-600">
                {kcalReference ? `목표 ${kcalReference.toLocaleString()}` : '영양 상세'}
              </span>
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${kcalProgress ?? 0}%` }}
              />
            </div>

            <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-200">
              <Macro label="탄수화물" value={todayNutrition.carbs_g} className="text-amber-500" />
              <Macro label="단백질" value={todayNutrition.protein_g} className="text-blue-600" />
              <Macro label="지방" value={todayNutrition.fat_g} className="text-rose-500" />
            </div>
          </Link>

          <Link
            href="/meals/add"
            className="apple-accent-surface mt-3 flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
          >
            <Camera size={19} />
            사진으로 식사 기록
          </Link>
        </section>

        <ActivityCalendar
          summaries={calendarSummaries}
          today={calendarToday}
          nutritionGoals={calendarGoals}
        />

        {isLoading && (
          <p className="mt-4 text-center text-xs text-zinc-500" role="status">
            최신 기록을 동기화하고 있어요
          </p>
        )}

        {loadError && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4" role="alert">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-700">일부 데이터를 불러오지 못했어요</p>
              <p className="mt-1 text-xs text-amber-700/70">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700"
              aria-label="다시 불러오기"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}


// ─────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────

function SectionHeader({
  title,
  href,
  action,
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-zinc-200">
        {title}
      </h2>

      {href &&
        action && (
          <Link
            href={href}
            className="flex items-center gap-0.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {action}

            <ChevronRight
              size={14}
            />
          </Link>
        )}
    </div>
  );
}


function TodayStatus({
  icon: Icon,
  label,
  value,
  href,
  iconClass,
  bgClass,
}: {
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;
  label: string;
  value: string;
  href: string;
  iconClass: string;
  bgClass: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-4"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-xl ${bgClass}`}
      >
        <Icon
          size={16}
          className={
            iconClass
          }
        />
      </div>

      <p className="mt-3 text-[10px] text-zinc-600">
        {label}
      </p>

      <p className="mt-1 truncate text-xs font-semibold text-zinc-300">
        {value}
      </p>
    </Link>
  );
}


function PredictionSignal({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/15 px-3 py-3">
      <p className="text-[10px] text-zinc-500">
        {label}
      </p>

      <p className="mt-1.5 truncate text-xs font-semibold text-zinc-200">
        {value}
      </p>

      <p className="mt-1 text-[9px] text-zinc-600">
        {delta}
      </p>
    </div>
  );
}


function DataSignal({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/15 px-3 py-3">
      <div className="flex items-center gap-1.5">
        <div
          className={`h-1.5 w-1.5 rounded-full ${
            ready
              ? 'bg-emerald-400'
              : 'bg-zinc-600'
          }`}
        />

        <p className="text-[10px] text-zinc-500">
          {label}
        </p>
      </div>

      <p className="mt-1.5 truncate text-xs font-semibold text-zinc-300">
        {value}
      </p>
    </div>
  );
}


function NutritionProgress({
  label,
  value,
  reference,
  progress,
  barClass,
}: {
  label: string;
  value: string;
  reference: string;
  progress: number | null;
  barClass: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-950/40 p-4">
      <p className="text-[10px] text-zinc-600">
        {label}
      </p>

      <p className="mt-1 text-base font-bold text-zinc-100">
        {value}
      </p>

      <p className="mt-1 truncate text-[9px] text-zinc-600">
        {reference}
      </p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{
            width:
              progress == null
                ? '0%'
                : `${progress}%`,
          }}
        />
      </div>
    </div>
  );
}


function Macro({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="text-center">
      <p
        className={`text-base font-bold ${className}`}
      >
        {Math.round(
          value,
        )}
        g
      </p>

      <p className="mt-1 text-[10px] text-zinc-600">
        {label}
      </p>
    </div>
  );
}


function BodyMetric({
  label,
  value,
  unit,
  delta,
  positiveDirection,
}: {
  label: string;
  value: string;
  unit: string;
  delta: number | null;
  positiveDirection:
    | 'up'
    | 'down'
    | 'neutral';
}) {
  const formattedDelta =
    delta == null
      ? null
      : `${
          delta > 0
            ? '+'
            : ''
        }${delta.toFixed(
          1,
        )}`;

  const deltaClass =
    (() => {
      if (
        delta == null ||
        delta === 0 ||
        positiveDirection ===
          'neutral'
      ) {
        return 'text-zinc-500';
      }

      const good =
        positiveDirection ===
        'up'
          ? delta > 0
          : delta < 0;

      return good
        ? 'text-emerald-400'
        : 'text-rose-400';
    })();

  return (
    <div>
      <p className="text-[10px] text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-bold">
        {value}

        <span className="ml-0.5 text-xs font-medium text-zinc-500">
          {unit}
        </span>
      </p>

      {formattedDelta ? (
        <p
          className={`mt-1 text-[10px] ${deltaClass}`}
        >
          이전 대비{' '}
          {formattedDelta}
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-zinc-700">
          변화 데이터 없음
        </p>
      )}
    </div>
  );
}


function QuickAction({
  href,
  icon: Icon,
  label,
  iconClass,
  bgClass,
}: {
  href: string;

  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;

  label: string;
  iconClass: string;
  bgClass: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-2 py-4 transition-colors hover:bg-zinc-900"
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${bgClass}`}
      >
        <Icon
          size={17}
          className={
            iconClass
          }
        />
      </div>

      <span className="mt-2 text-xs font-medium text-zinc-400">
        {label}
      </span>
    </Link>
  );
}
