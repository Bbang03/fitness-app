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
import GuardianProgressCard from '@/components/GuardianProgressCard';

import {
  buildGuardianProgress,
} from '@/lib/guardianProgress';

import {
  predict,
} from '@/lib/prediction';

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
                    rest_seconds,
                    record_type
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
                  ].sort(
                    (
                      a,
                      b,
                    ) =>
                      a.order -
                      b.order,
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

  if (!user) {
    return null;
  }

  // ─────────────────────────────────────────────
  // Non-hook derived data
  // ─────────────────────────────────────────────

  const todayKey =
    localDateKey();

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
    getInbodyRecords();

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
      <header className="apple-page-header">
        <div className="flex items-center justify-between">
          <div>
            <p className="apple-page-kicker">
              {todayLabel}
            </p>

            <h1 className="apple-page-title">
              오늘
            </h1>

            <p className="mt-1 text-sm text-zinc-500">
              {greeting}, {user.name}님
            </p>
          </div>

          <button
            type="button"
            onClick={
              handleLogout
            }
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 bg-white text-zinc-500 transition-colors hover:text-zinc-900"
            aria-label="로그아웃"
          >
            <LogOut
              size={18}
            />
          </button>
        </div>

        <GuardianProgressCard progress={guardianProgress} />

        <Link href="/meals" className="apple-card mt-6 block p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-zinc-500">오늘 섭취</p>
              <p className="mt-1 text-[2.5rem] font-bold leading-none tracking-[-0.045em] text-zinc-900">
                {Math.round(todayNutrition.kcal).toLocaleString()}
                <span className="ml-1.5 text-sm font-semibold tracking-normal text-zinc-500">kcal</span>
              </p>
            </div>
            <span className="text-xs font-semibold text-blue-600">
              {kcalReference ? `목표 ${kcalReference.toLocaleString()}` : '영양 상세'}
            </span>
          </div>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${kcalProgress}%` }}
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
          className="apple-accent-surface mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
        >
          <Camera size={19} />
          사진으로 식사 기록
        </Link>
      </header>

      {isLoading && (
        <div className="mx-5 mb-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />

            <p className="text-xs text-zinc-500">
              최신 기록을 동기화하고 있어요
            </p>
          </div>
        </div>
      )}

      {loadError && (
        <section className="px-5 mb-5">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle
                size={18}
                className="mt-0.5 flex-shrink-0 text-amber-400"
              />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-200">
                  일부 데이터를 불러오지 못했어요
                </p>

                <p className="mt-1 text-xs leading-relaxed text-amber-200/60">
                  {loadError}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setReloadKey(
                    (
                      value,
                    ) =>
                      value + 1,
                  )
                }
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300"
                aria-label="다시 불러오기"
              >
                <RefreshCw
                  size={15}
                />
              </button>
            </div>
          </div>
        </section>
      )}

      {activeWorkout && (
        <section className="px-5 mb-5">
          <div className="rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
                  <Flame
                    size={19}
                    className="text-orange-400"
                  />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-orange-200">
                    운동이 진행 중이에요
                  </p>

                  <p className="mt-0.5 truncate text-xs text-orange-300/60">
                    {
                      activeWorkout.routineName
                    }
                  </p>
                </div>
              </div>

              <Link
                href={`/routines/${activeWorkout.routineId}/workout`}
                className="flex-shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white"
              >
                이어서
              </Link>
            </div>
          </div>
        </section>
      )}

      <main>
        {/* Today status */}
        <section className="px-5 mb-7">
          <SectionHeader
            title="오늘의 상태"
          />

          <div className="grid grid-cols-3 gap-2">
            <TodayStatus
              icon={
                Dumbbell
              }
              label="운동"
              value={
                activeWorkout
                  ? '진행 중'
                  : todayWorkoutCount >
                    0
                    ? `${todayWorkoutCount}회 완료`
                    : '미기록'
              }
              href="/routines"
              iconClass="text-blue-400"
              bgClass="bg-blue-500/10"
            />

            <TodayStatus
              icon={
                UtensilsCrossed
              }
              label="식사"
              value={
                todayMealCount >
                0
                  ? `${todayMealCount}끼`
                  : '미기록'
              }
              href="/meals"
              iconClass="text-emerald-400"
              bgClass="bg-emerald-500/10"
            />

            <TodayStatus
              icon={
                Target
              }
              label="단백질"
              value={`${Math.round(
                todayNutrition.protein_g,
              )}g`}
              href="/meals"
              iconClass="text-amber-400"
              bgClass="bg-amber-500/10"
            />
          </div>
        </section>

        {/* AI */}
        <section className="px-5 mb-7">
          <Link
            href="/insights"
            className="group block overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/15 via-zinc-900 to-zinc-950 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
                  <Sparkles
                    size={20}
                  />
                </div>

                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
                  CHAGOK AI
                </p>

                <h2 className="mt-2 text-xl font-bold leading-snug">
                  {latestInbody
                    ? '현재 패턴의 30일 후 변화'
                    : '첫 예측을 준비해볼까요?'}
                </h2>

                <p className="mt-3 max-w-[310px] text-sm leading-relaxed text-zinc-400">
                  {aiDescription}
                </p>
              </div>

              <ArrowUpRight
                size={20}
                className="mt-1 flex-shrink-0 text-zinc-600 transition-colors group-hover:text-blue-400"
              />
            </div>

            {prediction ? (
              <div className="mt-5 grid grid-cols-3 gap-2">
                <PredictionSignal
                  label="체중"
                  value={`${prediction.predictedWeight_kg}kg`}
                  delta={signed(
                    prediction.deltaWeight_kg,
                    'kg',
                  )}
                />

                <PredictionSignal
                  label="골격근량"
                  value={`${prediction.predictedSkeletal_kg}kg`}
                  delta={signed(
                    prediction.deltaSkeletal_kg,
                    'kg',
                  )}
                />

                <PredictionSignal
                  label="체지방률"
                  value={`${prediction.predictedBodyFatPct}%`}
                  delta={signed(
                    prediction.deltaBodyFatPct,
                    '%',
                  )}
                />
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-3 gap-2">
                <DataSignal
                  label="운동"
                  value={`${myLogs.length}회`}
                  ready={
                    myLogs.length >
                    0
                  }
                />

                <DataSignal
                  label="식단"
                  value={
                    myMealLogs.length >
                    0
                      ? `${recentNutrition.recordedDays}일`
                      : '기록 필요'
                  }
                  ready={
                    myMealLogs.length >
                    0
                  }
                />

                <DataSignal
                  label="체성분"
                  value={`${inbodyRecords.length}회`}
                  ready={
                    inbodyRecords.length >
                    0
                  }
                />
              </div>
            )}
          </Link>
        </section>

        {/* Quick actions */}
        <section className="px-5 mb-7">
          <SectionHeader
            title="빠른 기록"
          />

          <div className="grid grid-cols-3 gap-2">
            <QuickAction
              href="/routines"
              icon={
                Dumbbell
              }
              label="운동 시작"
              iconClass="text-blue-400"
              bgClass="bg-blue-500/10"
            />

            <QuickAction
              href="/meals/add"
              icon={
                Camera
              }
              label="식사 추가"
              iconClass="text-emerald-400"
              bgClass="bg-emerald-500/10"
            />

            <QuickAction
              href="/inbody/new"
              icon={
                Activity
              }
              label="체성분"
              iconClass="text-violet-400"
              bgClass="bg-violet-500/10"
            />
          </div>
        </section>

        {/* Nutrition */}
        <section className="px-5 mb-7">
          <SectionHeader
            title="오늘의 영양"
            href="/meals"
            action="상세"
          />

          <Link
            href="/meals"
            className="block rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-5"
          >
            <div className="grid grid-cols-2 gap-3">
              <NutritionProgress
                label="섭취 열량"
                value={`${Math.round(
                  todayNutrition.kcal,
                )} kcal`}
                reference={
                  kcalReference
                    ? `추정 유지 ${kcalReference.toLocaleString()} kcal`
                    : '오늘 기록'
                }
                progress={
                  kcalProgress
                }
                barClass="bg-emerald-500"
              />

              <NutritionProgress
                label="단백질"
                value={`${Math.round(
                  todayNutrition.protein_g,
                )} g`}
                reference={
                  proteinGoal
                    ? `참고 ${Math.round(
                        proteinGoal,
                      )} g`
                    : '체성분 기록 후 목표 계산'
                }
                progress={
                  proteinProgress
                }
                barClass="bg-blue-500"
              />
            </div>

            <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-800 border-t border-zinc-800/80 pt-5">
              <Macro
                label="탄수화물"
                value={
                  todayNutrition.carbs_g
                }
                className="text-amber-400"
              />

              <Macro
                label="단백질"
                value={
                  todayNutrition.protein_g
                }
                className="text-blue-400"
              />

              <Macro
                label="지방"
                value={
                  todayNutrition.fat_g
                }
                className="text-rose-400"
              />
            </div>
          </Link>
        </section>

        {/* Body composition */}
        <section className="px-5 mb-7">
          <SectionHeader
            title="최근 체성분"
            href="/inbody"
            action="전체"
          />

          {latestInbody ? (
            <Link
              href="/inbody"
              className="block rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-5"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">
                    최근 측정
                  </p>

                  <p className="mt-1 text-sm font-medium text-zinc-300">
                    {
                      latestInbody.measured_at.slice(0, 10)
                    }
                  </p>
                </div>

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
                  <Activity
                    size={18}
                    className="text-violet-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <BodyMetric
                  label="체중"
                  value={`${latestInbody.weight_kg}`}
                  unit="kg"
                  delta={
                    weightDelta
                  }
                  positiveDirection="neutral"
                />

                <BodyMetric
                  label="골격근량"
                  value={`${latestInbody.skeletal_muscle_kg}`}
                  unit="kg"
                  delta={
                    muscleDelta
                  }
                  positiveDirection="up"
                />

                <BodyMetric
                  label="체지방률"
                  value={`${latestInbody.body_fat_pct}`}
                  unit="%"
                  delta={
                    fatDelta
                  }
                  positiveDirection="down"
                />
              </div>
            </Link>
          ) : (
            <Link
              href="/inbody/new"
              className="flex items-center justify-between rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 p-5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/10">
                  <Activity
                    size={20}
                    className="text-violet-400"
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold">
                    첫 체성분을 기록해보세요
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    사진으로 자동 입력할 수 있어요
                  </p>
                </div>
              </div>

              <Plus
                size={18}
                className="text-zinc-600"
              />
            </Link>
          )}
        </section>

        {/* Workout routines */}
        <section className="px-5 mb-7">
          <SectionHeader
            title="운동 시작"
            href="/routines"
            action="전체"
          />

          {myRoutines.length ===
          0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-5 py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                <Dumbbell
                  size={22}
                  className="text-blue-400"
                />
              </div>

              <p className="mt-4 text-sm font-semibold">
                아직 운동 루틴이 없어요
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                첫 루틴을 만들고 운동 기록을 시작하세요
              </p>

              <Link
                href="/routines/new"
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Plus
                  size={16}
                />

                루틴 만들기
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {myRoutines
                .slice(
                  0,
                  3,
                )
                .map(
                  (
                    routine,
                  ) => (
                    <div
                      key={
                        routine.id
                      }
                      className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {
                            routine.name
                          }
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          {
                            routine
                              .items
                              .length
                          }{' '}
                          가지 운동
                        </p>
                      </div>

                      <Link
                        href={`/routines/${routine.id}/workout`}
                        className="ml-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-500"
                        aria-label={`${routine.name} 운동 시작`}
                      >
                        <Play
                          size={16}
                          fill="currentColor"
                        />
                      </Link>
                    </div>
                  ),
                )}
            </div>
          )}
        </section>

        {/* Recent workout */}
        <section className="px-5">
          <SectionHeader
            title="최근 운동"
            href="/history"
            action="전체"
          />

          {recentLogs.length ===
          0 ? (
            <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-5 text-center">
              <p className="text-sm text-zinc-500">
                아직 완료된 운동 기록이 없어요.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLogs.map(
                (
                  log,
                ) => {
                  const volume =
                    calcTotalVolume(
                      log.sets,
                    );

                  const durationMin =
                    log.finished_at
                      ? Math.round(
                          (
                            new Date(
                              log.finished_at,
                            ).getTime() -
                            new Date(
                              log.started_at,
                            ).getTime()
                          ) /
                            60000,
                        )
                      : null;

                  return (
                    <div
                      key={
                        log.id
                      }
                      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {
                              log.routine_name
                            }
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            {formatDate(
                              log.started_at,
                            )}
                          </p>
                        </div>

                        <Dumbbell
                          size={17}
                          className="text-zinc-700"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="text-xs text-zinc-400">
                          {
                            log.sets
                              .length
                          }{' '}
                          세트
                        </span>

                        {volume >
                          0 && (
                          <span className="text-xs text-zinc-400">
                            {volume.toLocaleString()}
                            kg
                          </span>
                        )}

                        {durationMin !=
                          null &&
                          durationMin >
                            0 && (
                            <span className="text-xs text-zinc-400">
                              {
                                durationMin
                              }
                              분
                            </span>
                          )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </section>

        <div className="h-4" />
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
