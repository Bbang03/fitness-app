'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  PointerEvent as ReactPointerEvent,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertCircle,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flame,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';

import AppShell from '@/components/AppShell';

import { useStore } from '@/lib/store';

import {
  createClient,
} from '@/lib/supabase/client';

import {
  calcTotalVolume,
  formatDate,
} from '@/lib/utils';

import type {
  Routine,
  WorkoutLog,
} from '@/lib/types';

export default function RoutinesPage() {
  const router =
    useRouter();

  const {
    currentUser,

    routines,
    setRoutines,

    workoutLogs,
    setWorkoutLogs,

    deleteRoutine,

    activeWorkout,
  } = useStore();

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    deletingId,
    setDeletingId,
  ] = useState<
    string | null
  >(null);

  const [
    openSwipeId,
    setOpenSwipeId,
  ] = useState<
    string | null
  >(null);

  const user =
    currentUser();

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
  // Load workout data
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      return;
    }

    const userId =
      user.id;

    const loadWorkoutData =
      async () => {
        setIsLoading(
          true,
        );

        const supabase =
          createClient();

        const {
          data:
            authData,
        } =
          await supabase.auth.getUser();

        /*
         * Guest는 기존 Zustand/localStorage 사용
         */
        if (
          !authData.user
        ) {
          setIsLoading(
            false,
          );

          return;
        }

        const [
          routinesResult,
          workoutLogsResult,
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
          ]);

        if (
          routinesResult.error
        ) {
          console.error(
            'Routine load failed:',
            routinesResult
              .error
              .message,
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

        if (
          workoutLogsResult.error
        ) {
          console.error(
            'Workout log load failed:',
            workoutLogsResult
              .error
              .message,
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

        setIsLoading(
          false,
        );
      };

    void loadWorkoutData();
  }, [
    user?.id,
    setRoutines,
    setWorkoutLogs,
  ]);

  if (!user) {
    return null;
  }

  // ─────────────────────────────────────────────
  // Derived data
  // ─────────────────────────────────────────────

  const myRoutines =
    routines
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
      );

  const myLogs =
    workoutLogs
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
      );

  const weekLogs =
    useMemo(
      () =>
        myLogs.filter(
          (
            log,
          ) => {
            const date =
              new Date(
                log.started_at,
              );

            const now =
              new Date();

            const diff =
              (
                now.getTime() -
                date.getTime()
              ) /
              (
                1000 *
                60 *
                60 *
                24
              );

            return (
              diff >= 0 &&
              diff <= 7
            );
          },
        ),
      [myLogs],
    );

  const weekSets =
    weekLogs.reduce(
      (
        sum,
        log,
      ) =>
        sum +
        log.sets.length,
      0,
    );

  const latestLog =
    myLogs.at(0) ??
    null;

  const latestVolume =
    latestLog
      ? calcTotalVolume(
          latestLog.sets,
        )
      : 0;

  const latestDuration =
    latestLog?.finished_at
      ? Math.max(
          0,
          Math.round(
            (
              new Date(
                latestLog.finished_at,
              ).getTime() -
              new Date(
                latestLog.started_at,
              ).getTime()
            ) /
              60000,
          ),
        )
      : null;

  // ─────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────

  const handleDeleteRoutine =
    async (
      id: string,
    ) => {
      if (deletingId) {
        return;
      }

      setDeletingId(id);

      const success =
        await deleteRoutine(
          id,
        );

      setDeletingId(
        null,
      );

      setOpenSwipeId(
        null,
      );

      if (!success) {
        console.error(
          '루틴 삭제에 실패했습니다.',
        );
      }
    };

  return (
    <AppShell>
      {/* Header */}
      <header className="px-5 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-blue-400">
              WORKOUT
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              운동
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              루틴을 선택하고
              오늘의 운동을 시작하세요.
            </p>
          </div>

          <Link
            href="/routines/new"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-500"
            aria-label="새 루틴 만들기"
          >
            <Plus
              size={20}
            />
          </Link>
        </div>
      </header>

      {/* Loading */}
      {isLoading && (
        <div className="mx-5 mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />

            <p className="text-xs text-zinc-500">
              운동 데이터를 불러오고 있어요
            </p>
          </div>
        </div>
      )}

      {/* Active workout */}
      {activeWorkout && (
        <section className="px-5 mb-6">
          <div className="rounded-3xl border border-orange-500/25 bg-orange-500/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
                  <AlertCircle
                    size={20}
                    className="text-orange-400"
                  />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-orange-300">
                    진행 중인 운동
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

      {/* Weekly summary */}
      <section className="px-5 mb-7">
        <SectionTitle
          title="이번 주"
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
              <Flame
                size={18}
                className="text-orange-400"
              />
            </div>

            <p className="mt-5 text-2xl font-bold">
              {
                weekLogs.length
              }

              <span className="ml-1 text-sm font-medium text-zinc-500">
                회
              </span>
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              최근 7일 운동
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Dumbbell
                size={18}
                className="text-blue-400"
              />
            </div>

            <p className="mt-5 text-2xl font-bold">
              {
                weekSets
              }

              <span className="ml-1 text-sm font-medium text-zinc-500">
                세트
              </span>
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              최근 7일 완료
            </p>
          </div>
        </div>
      </section>

      {/* Latest workout */}
      {latestLog && (
        <section className="px-5 mb-7">
          <SectionTitle
            title="최근 운동"
            href="/history"
            action="전체"
          />

          <Link
            href="/history"
            className="block rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">
                  {
                    latestLog.routine_name
                  }
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  {formatDate(
                    latestLog.started_at,
                  )}
                </p>
              </div>

              <ChevronRight
                size={18}
                className="text-zinc-700"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <WorkoutChip>
                {
                  latestLog.sets
                    .length
                }{' '}
                세트
              </WorkoutChip>

              {latestDuration !=
                null &&
                latestDuration >
                  0 && (
                  <WorkoutChip>
                    <Clock3
                      size={12}
                    />

                    {
                      latestDuration
                    }
                    분
                  </WorkoutChip>
                )}

              {latestVolume >
                0 && (
                <WorkoutChip>
                  {latestVolume.toLocaleString()}
                  kg
                </WorkoutChip>
              )}
            </div>
          </Link>
        </section>
      )}

      {/* Routines */}
      <section className="px-5">
        <SectionTitle
          title="내 루틴"
          href="/routines/new"
          action="추가"
        />

        {myRoutines.length ===
        0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-5 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10">
              <Dumbbell
                size={25}
                className="text-blue-400"
              />
            </div>

            <p className="mt-5 text-sm font-semibold">
              아직 운동 루틴이 없어요
            </p>

            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              자주 하는 운동을
              루틴으로 만들어두면
              빠르게 운동을 시작할 수
              있어요.
            </p>

            <Link
              href="/routines/new"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus
                size={17}
              />

              첫 루틴 만들기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myRoutines.map(
              (
                routine,
              ) => (
                <SwipeRoutineCard
                  key={
                    routine.id
                  }
                  routine={
                    routine
                  }
                  isOpen={
                    openSwipeId ===
                    routine.id
                  }
                  isDeleting={
                    deletingId ===
                    routine.id
                  }
                  onOpen={() =>
                    setOpenSwipeId(
                      routine.id,
                    )
                  }
                  onClose={() =>
                    setOpenSwipeId(
                      (
                        current,
                      ) =>
                        current ===
                        routine.id
                          ? null
                          : current,
                    )
                  }
                  onEdit={() => {
                    setOpenSwipeId(
                      null,
                    );

                    router.push(
                      `/routines/${routine.id}`,
                    );
                  }}
                  onStart={() => {
                    setOpenSwipeId(
                      null,
                    );

                    router.push(
                      `/routines/${routine.id}/workout`,
                    );
                  }}
                  onDelete={() => {
                    void handleDeleteRoutine(
                      routine.id,
                    );
                  }}
                />
              ),
            )}
          </div>
        )}
      </section>

      <div className="h-4" />
    </AppShell>
  );
}


const DELETE_WIDTH = 84;

function SwipeRoutineCard({
  routine,
  isOpen,
  isDeleting,
  onOpen,
  onClose,
  onEdit,
  onStart,
  onDelete,
}: {
  routine: Routine;
  isOpen: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const [
    offsetX,
    setOffsetX,
  ] = useState(
    isOpen
      ? -DELETE_WIDTH
      : 0,
  );

  const offsetXRef =
    useRef(offsetX);

  const suppressClickRef =
    useRef(false);

  const gestureRef =
    useRef({
      pointerId:
        null as number | null,

      startX: 0,
      startY: 0,

      baseOffset: 0,

      axis:
        null as
          | 'horizontal'
          | 'vertical'
          | null,
    });

  useEffect(() => {
    const next =
      isOpen
        ? -DELETE_WIDTH
        : 0;

    offsetXRef.current =
      next;

    setOffsetX(
      next,
    );
  }, [isOpen]);

  const sortedItems =
    useMemo(
      () =>
        [
          ...routine.items,
        ].sort(
          (
            a,
            b,
          ) =>
            a.order -
            b.order,
        ),
      [routine.items],
    );

  const totalSets =
    routine.items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.target_sets,
      0,
    );

  const visibleExercises =
    sortedItems.slice(
      0,
      3,
    );

  const hiddenCount =
    Math.max(
      0,
      sortedItems.length -
        visibleExercises.length,
    );

  const setOffset = (
    value: number,
  ) => {
    const clamped =
      Math.max(
        -DELETE_WIDTH,
        Math.min(
          0,
          value,
        ),
      );

    offsetXRef.current =
      clamped;

    setOffsetX(
      clamped,
    );
  };

  const resetGesture =
    () => {
      gestureRef.current = {
        pointerId: null,

        startX: 0,
        startY: 0,

        baseOffset: 0,

        axis: null,
      };
    };

  const handlePointerDown =
    (
      event:
        ReactPointerEvent<HTMLElement>,
    ) => {
      if (isDeleting) {
        return;
      }

      if (
        event.pointerType ===
          'mouse' &&
        event.button !== 0
      ) {
        return;
      }

      const target =
        event.target as HTMLElement;

      if (
        target.closest(
          'button, a',
        )
      ) {
        return;
      }

      gestureRef.current = {
        pointerId:
          event.pointerId,

        startX:
          event.clientX,

        startY:
          event.clientY,

        baseOffset:
          offsetXRef.current,

        axis: null,
      };

      try {
        event.currentTarget.setPointerCapture(
          event.pointerId,
        );
      } catch {
        // ignore
      }
    };

  const handlePointerMove =
    (
      event:
        ReactPointerEvent<HTMLElement>,
    ) => {
      const gesture =
        gestureRef.current;

      if (
        gesture.pointerId !==
        event.pointerId
      ) {
        return;
      }

      const dx =
        event.clientX -
        gesture.startX;

      const dy =
        event.clientY -
        gesture.startY;

      if (
        gesture.axis ===
        null
      ) {
        if (
          Math.abs(dx) <
            6 &&
          Math.abs(dy) <
            6
        ) {
          return;
        }

        gesture.axis =
          Math.abs(dx) >
          Math.abs(dy)
            ? 'horizontal'
            : 'vertical';
      }

      if (
        gesture.axis !==
        'horizontal'
      ) {
        return;
      }

      event.preventDefault();

      if (
        Math.abs(dx) >
        8
      ) {
        suppressClickRef.current =
          true;
      }

      setOffset(
        gesture.baseOffset +
          dx,
      );
    };

  const finishGesture =
    (
      event:
        ReactPointerEvent<HTMLElement>,
    ) => {
      const gesture =
        gestureRef.current;

      if (
        gesture.pointerId !==
        event.pointerId
      ) {
        return;
      }

      if (
        gesture.axis ===
        'horizontal'
      ) {
        const shouldOpen =
          offsetXRef.current <=
          -DELETE_WIDTH *
            0.42;

        if (shouldOpen) {
          setOffset(
            -DELETE_WIDTH,
          );

          onOpen();
        } else {
          setOffset(0);

          onClose();
        }

        window.setTimeout(
          () => {
            suppressClickRef.current =
              false;
          },
          80,
        );
      }

      try {
        event.currentTarget.releasePointerCapture(
          event.pointerId,
        );
      } catch {
        // ignore
      }

      resetGesture();
    };

  const cancelGesture =
    () => {
      setOffset(
        isOpen
          ? -DELETE_WIDTH
          : 0,
      );

      resetGesture();

      window.setTimeout(
        () => {
          suppressClickRef.current =
            false;
        },
        80,
      );
    };

  const handleCardClick =
    () => {
      if (
        suppressClickRef.current
      ) {
        return;
      }

      if (isOpen) {
        onClose();

        return;
      }

      onEdit();
    };

  return (
    <div className="relative overflow-hidden rounded-3xl">
      {/* Delete action underneath */}
      <button
        type="button"
        onClick={(
          event,
        ) => {
          event.stopPropagation();

          if (
            isDeleting
          ) {
            return;
          }

          onDelete();
        }}
        disabled={
          isDeleting
        }
        className="absolute inset-y-0 right-0 flex w-[84px] items-center justify-center rounded-r-3xl bg-red-600 text-white transition-colors active:bg-red-500 disabled:opacity-70"
        aria-label={`${routine.name} 삭제`}
      >
        <Trash2
          size={21}
        />
      </button>

      {/* Foreground routine card */}
      <article
        role="button"
        tabIndex={0}
        onClick={
          handleCardClick
        }
        onKeyDown={(
          event,
        ) => {
          if (
            event.key ===
              'Enter' ||
            event.key ===
              ' '
          ) {
            event.preventDefault();

            handleCardClick();
          }
        }}
        onPointerDown={
          handlePointerDown
        }
        onPointerMove={
          handlePointerMove
        }
        onPointerUp={
          finishGesture
        }
        onPointerCancel={
          cancelGesture
        }
        style={{
          transform: `translateX(${offsetX}px)`,

          transition:
            gestureRef.current
              .axis ===
            'horizontal'
              ? 'none'
              : 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',

          touchAction:
            'pan-y',
        }}
        className="relative z-10 cursor-pointer rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-5 outline-none transition-colors hover:bg-zinc-900/85 focus-visible:ring-2 focus-visible:ring-blue-500/40"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">
              {
                routine.name
              }
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              {
                routine.items
                  .length
              }{' '}
              가지 운동 ·{' '}
              {
                totalSets
              }{' '}
              세트
            </p>
          </div>

          <button
            type="button"
            onPointerDown={(
              event,
            ) =>
              event.stopPropagation()
            }
            onClick={(
              event,
            ) => {
              event.stopPropagation();

              onStart();
            }}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white transition-colors hover:bg-blue-500 active:scale-[0.97]"
            aria-label={`${routine.name} 운동 시작`}
          >
            <Play
              size={17}
              fill="currentColor"
            />
          </button>
        </div>

        {visibleExercises.length >
          0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {visibleExercises.map(
              (
                item,
              ) => (
                <span
                  key={
                    item.id
                  }
                  className="rounded-full border border-zinc-800 bg-zinc-950/50 px-2.5 py-1 text-[11px] text-zinc-400"
                >
                  {
                    item.exercise_name
                  }
                </span>
              ),
            )}

            {hiddenCount >
              0 && (
              <span className="rounded-full border border-zinc-800 bg-zinc-950/50 px-2.5 py-1 text-[11px] text-zinc-600">
                +
                {
                  hiddenCount
                }
              </span>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

function SectionTitle({
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

function WorkoutChip({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-800/80 px-2.5 py-1.5 text-[11px] text-zinc-400">
      {children}
    </span>
  );
}