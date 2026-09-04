'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';

import BottomNav from '@/components/BottomNav';

import {
  Play,
  Dumbbell,
  Flame,
  LogOut,
  AlertCircle,
  UtensilsCrossed,
  Activity,
} from 'lucide-react';

import {
  formatDate,
  calcTotalVolume,
} from '@/lib/utils';

import type {
  Routine,
  WorkoutLog,
} from '@/lib/types';

const KCAL_GOAL = 2000;

export default function DashboardPage() {
  const router = useRouter();

  const {
    currentUser,
    routines,
    setRoutines,
    workoutLogs,
    setWorkoutLogs,
    logout,
    activeWorkout,
    getDailyNutrition,
    getInbodyRecords,
  } = useStore();

  const [isLoading, setIsLoading] =
    useState(true);

  const user = currentUser();

  // ── Logout ──────────────────────────────────────────────────────────

  const handleLogout = async () => {
    const supabase = createClient();

    const { error } =
      await supabase.auth.signOut({
        scope: 'local',
      });

    if (error) {
      console.error(
        'Logout failed:',
        error.message,
      );
      return;
    }

    logout();
    router.replace('/login');
  };

  // ── Auth guard ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user?.id, router]);

  // ── Load dashboard data from Supabase ───────────────────────────────

  useEffect(() => {
    if (!user) return;

    const userId = user.id;

    const loadDashboardData =
      async () => {
        setIsLoading(true);

        const supabase =
          createClient();

        const {
          data: authData,
        } =
          await supabase.auth.getUser();

        // 비회원은 기존 Zustand/localStorage 데이터 사용
        if (!authData.user) {
          setIsLoading(false);
          return;
        }

        // 루틴과 운동 기록을 동시에 조회
        const [
          routinesResult,
          workoutLogsResult,
        ] = await Promise.all([
          supabase
            .from('routines')
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
                ascending: false,
              },
            ),

          supabase
            .from('workout_logs')
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
                ascending: false,
              },
            ),
        ]);

        // ── Routines ──────────────────────────────────────────────────

        if (routinesResult.error) {
          console.error(
            'Dashboard routines load failed:',
            routinesResult.error.message,
          );
        } else {
          const loadedRoutines:
            Routine[] = (
            routinesResult.data ?? []
          ).map((routine) => ({
            id: routine.id,
            user_id:
              routine.user_id,
            name: routine.name,
            created_at:
              routine.created_at,
            items: [
              ...(
                routine.routine_items ??
                []
              ),
            ].sort(
              (a, b) =>
                a.order -
                b.order,
            ),
          }));

          setRoutines(
            loadedRoutines,
          );
        }

        // ── Workout logs ──────────────────────────────────────────────

        if (workoutLogsResult.error) {
          console.error(
            'Dashboard workout logs load failed:',
            workoutLogsResult.error.message,
          );
        } else {
          const loadedWorkoutLogs:
            WorkoutLog[] = (
            workoutLogsResult.data ??
            []
          ).map((log) => ({
            id: log.id,
            user_id:
              log.user_id,
            routine_id:
              log.routine_id ??
              '',
            routine_name:
              log.routine_name ??
              '',
            date: log.date,
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
              (a, b) =>
                a.set_number -
                b.set_number,
            ),
          }));

          setWorkoutLogs(
            loadedWorkoutLogs,
          );
        }

        setIsLoading(false);
      };

    loadDashboardData();
  }, [
    user?.id,
    setRoutines,
    setWorkoutLogs,
  ]);

  if (!user) return null;

  // ── Derived data ────────────────────────────────────────────────────

  const myRoutines = routines
    .filter(
      (routine) =>
        routine.user_id ===
        user.id,
    )
    .sort(
      (a, b) =>
        new Date(
          b.created_at,
        ).getTime() -
        new Date(
          a.created_at,
        ).getTime(),
    );

  const myLogs = workoutLogs
    .filter(
      (log) =>
        log.user_id ===
        user.id,
    )
    .sort(
      (a, b) =>
        new Date(
          b.started_at,
        ).getTime() -
        new Date(
          a.started_at,
        ).getTime(),
    );

  const recentLogs =
    myLogs.slice(0, 5);

  // 한국 로컬 날짜 기준
  const todayKey =
    new Date().toLocaleDateString(
      'en-CA',
    );

  const todayNutrition =
    getDailyNutrition(
      todayKey,
    );

  const kcalPct = Math.min(
    100,
    Math.round(
      (todayNutrition.kcal /
        KCAL_GOAL) *
        100,
    ),
  );

  const latestInbody =
    getInbodyRecords().at(
      -1,
    ) ?? null;

  const totalSets =
    myLogs.reduce(
      (sum, log) =>
        sum +
        log.sets.length,
      0,
    );

  const weekLogs =
    myLogs.filter(
      (log) => {
        const workoutDate =
          new Date(
            log.started_at,
          );

        const now =
          new Date();

        const diffDays =
          (now.getTime() -
            workoutDate.getTime()) /
          (
            1000 *
            60 *
            60 *
            24
          );

        return (
          diffDays >= 0 &&
          diffDays <= 7
        );
      },
    );

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-start justify-between">
        <div>
          <p className="text-zinc-400 text-sm">
            안녕하세요 👋
          </p>

          <h1 className="text-xl font-bold mt-0.5">
            {user.name}님
          </h1>
        </div>

        <button
          onClick={
            handleLogout
          }
          className="text-zinc-500 hover:text-zinc-300 p-2 -mr-2"
        >
          <LogOut size={20} />
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="mx-4 mb-4 bg-zinc-900 rounded-2xl px-4 py-3 text-center">
          <p className="text-xs text-zinc-500">
            데이터를 불러오는 중...
          </p>
        </div>
      )}

      {/* In-progress workout banner */}
      {activeWorkout && (
        <div className="mx-4 mb-4 bg-orange-500/20 border border-orange-500/40 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle
              size={20}
              className="text-orange-400"
            />

            <div>
              <p className="text-sm font-semibold text-orange-300">
                운동 진행 중
              </p>

              <p className="text-xs text-orange-400/80">
                {
                  activeWorkout.routineName
                }
              </p>
            </div>
          </div>

          <Link
            href={`/routines/${activeWorkout.routineId}/workout`}
            className="bg-orange-500 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
          >
            이어서
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame
              size={16}
              className="text-orange-400"
            />

            <span className="text-xs text-zinc-400">
              이번 주 운동
            </span>
          </div>

          <p className="text-2xl font-bold">
            {weekLogs.length}
          </p>

          <p className="text-xs text-zinc-500 mt-0.5">
            회
          </p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Dumbbell
              size={16}
              className="text-blue-400"
            />

            <span className="text-xs text-zinc-400">
              누적 세트
            </span>
          </div>

          <p className="text-2xl font-bold">
            {totalSets}
          </p>

          <p className="text-xs text-zinc-500 mt-0.5">
            세트
          </p>
        </div>
      </div>

      {/* Today's nutrition */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-zinc-300 uppercase tracking-wider">
            오늘 식단
          </h2>

          <Link
            href="/meals"
            className="text-blue-400 text-sm"
          >
            식단 기록
          </Link>
        </div>

        <Link
          href="/meals"
          className="block bg-zinc-900 rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UtensilsCrossed
                size={16}
                className="text-emerald-400"
              />

              <span className="text-sm font-medium">
                {Math.round(
                  todayNutrition.kcal,
                )}{' '}

                <span className="text-zinc-500 text-xs font-normal">
                  / {KCAL_GOAL}{' '}
                  kcal
                </span>
              </span>
            </div>

            <span className="text-xs text-zinc-500">
              {kcalPct}%
            </span>
          </div>

          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{
                width: `${kcalPct}%`,
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              {
                label: '탄수',
                value:
                  todayNutrition.carbs_g,
                color:
                  'text-amber-400',
              },
              {
                label: '단백',
                value:
                  todayNutrition.protein_g,
                color:
                  'text-blue-400',
              },
              {
                label: '지방',
                value:
                  todayNutrition.fat_g,
                color:
                  'text-rose-400',
              },
            ].map(
              ({
                label,
                value,
                color,
              }) => (
                <div
                  key={
                    label
                  }
                >
                  <p
                    className={`text-sm font-bold ${color}`}
                  >
                    {Math.round(
                      value,
                    )}
                    g
                  </p>

                  <p className="text-[10px] text-zinc-500">
                    {label}
                  </p>
                </div>
              ),
            )}
          </div>
        </Link>
      </div>

      {/* InBody snapshot */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-zinc-300 uppercase tracking-wider">
            인바디
          </h2>

          <Link
            href="/inbody"
            className="text-blue-400 text-sm"
          >
            상세 보기
          </Link>
        </div>

        <Link
          href={
            latestInbody
              ? '/inbody'
              : '/inbody/new'
          }
          className="block bg-zinc-900 rounded-2xl p-4"
        >
          {latestInbody ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                {
                  label:
                    '체중',
                  value:
                    `${latestInbody.weight_kg}kg`,
                  color:
                    'text-white',
                },
                {
                  label:
                    '골격근',
                  value:
                    `${latestInbody.skeletal_muscle_kg}kg`,
                  color:
                    'text-blue-400',
                },
                {
                  label:
                    '체지방',
                  value:
                    `${latestInbody.body_fat_pct}%`,
                  color:
                    'text-rose-400',
                },
              ].map(
                ({
                  label,
                  value,
                  color,
                }) => (
                  <div
                    key={
                      label
                    }
                  >
                    <p
                      className={`text-base font-bold ${color}`}
                    >
                      {value}
                    </p>

                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {label}
                    </p>
                  </div>
                ),
              )}

              <p className="col-span-3 text-[10px] text-zinc-600 mt-1">
                측정일{' '}
                {
                  latestInbody.measured_at
                }
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-zinc-500">
              <Activity
                size={18}
                className="text-zinc-600"
              />

              <p className="text-sm">
                인바디 기록을
                추가해 체성분
                추이를 확인하세요
              </p>
            </div>
          )}
        </Link>
      </div>

      {/* Quick Start */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-zinc-300 uppercase tracking-wider">
            빠른 시작
          </h2>

          <Link
            href="/routines"
            className="text-blue-400 text-sm"
          >
            전체 보기
          </Link>
        </div>

        {myRoutines.length ===
        0 ? (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center">
            <Dumbbell
              size={32}
              className="text-zinc-600 mx-auto mb-3"
            />

            <p className="text-zinc-400 text-sm mb-3">
              아직 루틴이 없습니다
            </p>

            <Link
              href="/routines/new"
              className="inline-block bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
            >
              루틴 만들기
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {myRoutines
              .slice(0, 3)
              .map(
                (routine) => (
                  <div
                    key={
                      routine.id
                    }
                    className="bg-zinc-900 rounded-2xl px-4 py-3.5 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {
                          routine.name
                        }
                      </p>

                      <p className="text-xs text-zinc-400 mt-0.5">
                        {
                          routine
                            .items
                            .length
                        }
                        가지 운동
                      </p>
                    </div>

                    <Link
                      href={`/routines/${routine.id}/workout`}
                      className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl transition-colors"
                    >
                      <Play
                        size={16}
                        fill="white"
                      />
                    </Link>
                  </div>
                ),
              )}
          </div>
        )}
      </div>

      {/* Recent workouts */}
      {recentLogs.length >
        0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-zinc-300 uppercase tracking-wider">
              최근 운동
            </h2>

            <Link
              href="/history"
              className="text-blue-400 text-sm"
            >
              전체 보기
            </Link>
          </div>

          <div className="space-y-2">
            {recentLogs.map(
              (log) => {
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
                    className="bg-zinc-900 rounded-2xl px-4 py-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {
                          log.routine_name
                        }
                      </p>

                      <p className="text-xs text-zinc-500">
                        {formatDate(
                          log.started_at,
                        )}
                      </p>
                    </div>

                    <div className="flex gap-4 mt-1.5">
                      <span className="text-xs text-zinc-400">
                        {
                          log.sets
                            .length
                        }
                        세트
                      </span>

                      {volume >
                        0 && (
                        <span className="text-xs text-zinc-400">
                          {volume.toLocaleString()}
                          kg 볼륨
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
        </div>
      )}

      <BottomNav />
    </div>
  );
}