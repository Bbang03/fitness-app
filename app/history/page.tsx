'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Layers3,
  TrendingUp,
} from 'lucide-react';

import AppShell from '@/components/AppShell';

import { useStore } from '@/lib/store';

import {
  createClient,
} from '@/lib/supabase/client';

import {
  calcTotalVolume,
  formatDuration,
  isoToDateKey,
} from '@/lib/utils';

import type {
  RecordType,
  SetLog,
  WorkoutLog,
} from '@/lib/types';

// ─────────────────────────────────────────────
// Calendar helpers
// ─────────────────────────────────────────────

function getDaysInMonth(
  year: number,
  month: number,
) {
  return new Date(
    year,
    month + 1,
    0,
  ).getDate();
}

function getFirstDayOfWeek(
  year: number,
  month: number,
) {
  return new Date(
    year,
    month,
    1,
  ).getDay();
}

function setLabel(
  setLog: SetLog,
): string {
  const recordType:
    RecordType =
      setLog.record_type ??
      'weight_reps';

  if (
    recordType === 'time'
  ) {
    return formatDuration(
      setLog.duration_seconds ??
        0,
    );
  }

  if (
    recordType ===
    'reps_only'
  ) {
    return `${setLog.reps}회`;
  }

  return `${setLog.weight_kg}kg × ${setLog.reps}회`;
}

export default function HistoryPage() {
  const router =
    useRouter();

  const {
    currentUser,
    workoutLogs,
    setWorkoutLogs,
  } = useStore();

  const user =
    currentUser();

  const today =
    new Date();

  const [
    year,
    setYear,
  ] = useState(
    today.getFullYear(),
  );

  const [
    month,
    setMonth,
  ] = useState(
    today.getMonth(),
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState<
    string | null
  >(null);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  // ─────────────────────────────────────────────
  // Auth
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
  // Supabase workout logs
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      return;
    }

    const userId =
      user.id;

    const loadWorkoutLogs =
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

        // Guest
        if (!authData.user) {
          setIsLoading(
            false,
          );

          return;
        }

        const {
          data,
          error,
        } =
          await supabase
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
            );

        if (error) {
          console.error(
            'Workout logs load failed:',
            error.message,
          );

          setIsLoading(
            false,
          );

          return;
        }

        const loadedLogs:
          WorkoutLog[] =
            (
              data ?? []
            ).map(
              (log) => ({
                id: log.id,

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
                  (a, b) =>
                    a.set_number -
                    b.set_number,
                ),
              }),
            );

        setWorkoutLogs(
          loadedLogs,
        );

        setIsLoading(
          false,
        );
      };

    void loadWorkoutLogs();
  }, [
    user?.id,
    setWorkoutLogs,
  ]);

  if (!user) {
    return null;
  }

  // ─────────────────────────────────────────────
  // User logs
  // ─────────────────────────────────────────────

  const myLogs =
    workoutLogs
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

  const logsByDate =
    myLogs.reduce<
      Record<
        string,
        WorkoutLog[]
      >
    >(
      (
        result,
        log,
      ) => {
        const key =
          isoToDateKey(
            log.started_at,
          );

        (
          result[key] =
            result[key] || []
        ).push(log);

        return result;
      },
      {},
    );

  // ─────────────────────────────────────────────
  // Current displayed month
  // ─────────────────────────────────────────────

  const monthLogs =
    myLogs.filter(
      (log) => {
        const date =
          new Date(
            log.started_at,
          );

        return (
          date.getFullYear() ===
            year &&
          date.getMonth() ===
            month
        );
      },
    );

  const monthSets =
    monthLogs.reduce(
      (sum, log) =>
        sum +
        log.sets.length,
      0,
    );

  const monthVolume =
    monthLogs.reduce(
      (sum, log) =>
        sum +
        calcTotalVolume(
          log.sets,
        ),
      0,
    );

  const monthDurationSec =
    monthLogs.reduce(
      (sum, log) => {
        if (
          !log.finished_at
        ) {
          return sum;
        }

        const duration =
          Math.max(
            0,
            Math.round(
              (
                new Date(
                  log.finished_at,
                ).getTime() -
                new Date(
                  log.started_at,
                ).getTime()
              ) /
                1000,
            ),
          );

        return (
          sum + duration
        );
      },
      0,
    );

  const daysInMonth =
    getDaysInMonth(
      year,
      month,
    );

  const firstDay =
    getFirstDayOfWeek(
      year,
      month,
    );

  const selectedLogs =
    selectedDate
      ? logsByDate[
          selectedDate
        ] ?? []
      : [];

  const MONTHS = [
    '1월',
    '2월',
    '3월',
    '4월',
    '5월',
    '6월',
    '7월',
    '8월',
    '9월',
    '10월',
    '11월',
    '12월',
  ];

  const DAYS = [
    '일',
    '월',
    '화',
    '수',
    '목',
    '금',
    '토',
  ];

  // ─────────────────────────────────────────────
  // Month navigation
  // ─────────────────────────────────────────────

  const prevMonth = () => {
    if (month === 0) {
      setYear(
        (current) =>
          current - 1,
      );

      setMonth(11);
    } else {
      setMonth(
        (current) =>
          current - 1,
      );
    }

    setSelectedDate(
      null,
    );
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear(
        (current) =>
          current + 1,
      );

      setMonth(0);
    } else {
      setMonth(
        (current) =>
          current + 1,
      );
    }

    setSelectedDate(
      null,
    );
  };

  return (
    <AppShell>
      {/* Header */}
      <header className="px-5 pt-10 pb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(
                '/routines',
              )
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
            aria-label="운동으로 돌아가기"
          >
            <ChevronLeft
              size={21}
            />
          </button>

          <div>
            <p className="text-xs font-medium text-blue-400">
              WORKOUT HISTORY
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              운동 기록
            </h1>
          </div>
        </div>
      </header>

      {/* Monthly summary */}
      <section className="px-5 mb-7">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">
              {year}년{' '}
              {MONTHS[month]}
            </h2>

            <p className="mt-1 text-xs text-zinc-600">
              이번 달 운동 요약
            </p>
          </div>

          <TrendingUp
            size={17}
            className="text-zinc-700"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SummaryMetric
            icon={Dumbbell}
            value={`${monthLogs.length}`}
            label="운동"
            unit="회"
          />

          <SummaryMetric
            icon={Layers3}
            value={`${monthSets}`}
            label="완료 세트"
            unit="세트"
          />

          <SummaryMetric
            icon={Clock3}
            value={
              monthDurationSec >
              0
                ? formatCompactDuration(
                    monthDurationSec,
                  )
                : '0'
            }
            label="운동 시간"
            unit={
              monthDurationSec >
              0
                ? ''
                : '분'
            }
          />
        </div>

        {monthVolume > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-3">
            <span className="text-xs text-zinc-500">
              이번 달 총 볼륨
            </span>

            <span className="text-sm font-bold text-blue-400">
              {Math.round(
                monthVolume,
              ).toLocaleString()}
              kg
            </span>
          </div>
        )}
      </section>

      {/* Calendar */}
      <section className="px-5 mb-7">
        <div className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60">
          {/* Month navigation */}
          <div className="flex items-center justify-between border-b border-zinc-800/70 px-4 py-4">
            <button
              type="button"
              onClick={
                prevMonth
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ChevronLeft
                size={19}
              />
            </button>

            <div className="flex items-center gap-2">
              <CalendarDays
                size={15}
                className="text-blue-400"
              />

              <p className="text-sm font-semibold">
                {year}년{' '}
                {MONTHS[month]}
              </p>
            </div>

            <button
              type="button"
              onClick={
                nextMonth
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ChevronRight
                size={19}
              />
            </button>
          </div>

          {/* Week labels */}
          <div className="grid grid-cols-7 px-3 pt-3">
            {DAYS.map(
              (
                day,
                index,
              ) => (
                <div
                  key={day}
                  className={`py-1 text-center text-[10px] font-medium ${
                    index === 0
                      ? 'text-red-400/70'
                      : index ===
                          6
                        ? 'text-blue-400/70'
                        : 'text-zinc-600'
                  }`}
                >
                  {day}
                </div>
              ),
            )}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-y-1 px-3 pb-4 pt-1">
            {Array.from({
              length:
                firstDay,
            }).map(
              (_, index) => (
                <div
                  key={`empty-${index}`}
                  className="aspect-square"
                />
              ),
            )}

            {Array.from({
              length:
                daysInMonth,
            }).map(
              (
                _,
                index,
              ) => {
                const day =
                  index + 1;

                const dateKey =
                  `${year}-${String(
                    month + 1,
                  ).padStart(
                    2,
                    '0',
                  )}-${String(
                    day,
                  ).padStart(
                    2,
                    '0',
                  )}`;

                const hasWorkout =
                  Boolean(
                    logsByDate[
                      dateKey
                    ],
                  );

                const todayKey =
                  new Date().toLocaleDateString(
                    'en-CA',
                  );

                const isToday =
                  dateKey ===
                  todayKey;

                const isSelected =
                  selectedDate ===
                  dateKey;

                const dayOfWeek =
                  (
                    firstDay +
                    index
                  ) % 7;

                return (
                  <button
                    key={
                      dateKey
                    }
                    type="button"
                    onClick={() =>
                      setSelectedDate(
                        isSelected
                          ? null
                          : dateKey,
                      )
                    }
                    className="relative flex aspect-square items-center justify-center"
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm transition-colors ${
                        isSelected
                          ? 'bg-blue-600 font-bold text-white'
                          : isToday
                            ? 'bg-zinc-800 font-semibold text-white'
                            : 'hover:bg-zinc-800/60'
                      }`}
                    >
                      <span
                        className={
                          isSelected
                            ? 'text-white'
                            : dayOfWeek ===
                                0
                              ? 'text-red-400'
                              : dayOfWeek ===
                                  6
                                ? 'text-blue-400'
                                : 'text-zinc-300'
                        }
                      >
                        {day}
                      </span>
                    </div>

                    {hasWorkout && (
                      <span
                        className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                          isSelected
                            ? 'bg-white'
                            : 'bg-blue-400'
                        }`}
                      />
                    )}
                  </button>
                );
              },
            )}
          </div>
        </div>
      </section>

      {/* Loading */}
      {isLoading && (
        <section className="px-5">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-5 text-center">
            <div className="mx-auto h-2 w-2 animate-pulse rounded-full bg-blue-400" />

            <p className="mt-3 text-xs text-zinc-500">
              운동 기록을 불러오고 있어요
            </p>
          </div>
        </section>
      )}

      {/* Selected date */}
      {!isLoading &&
        selectedDate && (
          <section className="px-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-zinc-200">
                {formatSelectedDate(
                  selectedDate,
                )}
              </h2>

              <p className="mt-1 text-xs text-zinc-600">
                선택한 날짜의 운동 기록
              </p>
            </div>

            {selectedLogs.length ===
            0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center">
                <p className="text-sm text-zinc-500">
                  이 날은 운동 기록이 없어요.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedLogs.map(
                  (log) => (
                    <DetailedLogCard
                      key={log.id}
                      log={log}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        )}

      {/* Recent history */}
      {!isLoading &&
        !selectedDate && (
          <section className="px-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">
                  최근 운동
                </h2>

                <p className="mt-1 text-xs text-zinc-600">
                  최신 기록부터 확인할 수 있어요.
                </p>
              </div>

              <span className="text-xs text-zinc-600">
                {myLogs.length}회
              </span>
            </div>

            {myLogs.length ===
            0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/30 px-5 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                  <Dumbbell
                    size={22}
                    className="text-blue-400"
                  />
                </div>

                <p className="mt-4 text-sm font-semibold">
                  아직 운동 기록이 없어요
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  운동을 완료하면 이곳에 기록이 쌓입니다.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {myLogs
                  .slice(
                    0,
                    20,
                  )
                  .map(
                    (log) => (
                      <CompactLogCard
                        key={log.id}
                        log={log}
                        onClick={() =>
                          setSelectedDate(
                            isoToDateKey(
                              log.started_at,
                            ),
                          )
                        }
                      />
                    ),
                  )}
              </div>
            )}
          </section>
        )}

      <div className="h-4" />
    </AppShell>
  );
}

// ─────────────────────────────────────────────
// Monthly metric
// ─────────────────────────────────────────────

function SummaryMetric({
  icon: Icon,
  value,
  unit,
  label,
}: {
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;

  value: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3">
      <Icon
        size={15}
        className="text-blue-400"
      />

      <p className="mt-4 truncate text-lg font-bold">
        {value}

        {unit && (
          <span className="ml-1 text-[10px] font-medium text-zinc-600">
            {unit}
          </span>
        )}
      </p>

      <p className="mt-1 truncate text-[10px] text-zinc-600">
        {label}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Compact log card
// ─────────────────────────────────────────────

function CompactLogCard({
  log,
  onClick,
}: {
  log: WorkoutLog;
  onClick: () => void;
}) {
  const volume =
    calcTotalVolume(
      log.sets,
    );

  const durationSec =
    getWorkoutDuration(
      log,
    );

  const timedSeconds =
    log.sets.reduce(
      (sum, set) =>
        sum +
        (
          set.duration_seconds ??
          0
        ),
      0,
    );

  const exerciseCount =
    new Set(
      log.sets.map(
        (set) =>
          set.exercise_name,
      ),
    ).size;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-4 text-left transition-colors hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {log.routine_name}
          </p>

          <p className="mt-1 text-xs text-zinc-600">
            {formatLogDate(
              log.started_at,
            )}
          </p>
        </div>

        <ChevronRight
          size={17}
          className="flex-shrink-0 text-zinc-700"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <LogChip>
          {exerciseCount}개 운동
        </LogChip>

        <LogChip>
          {log.sets.length}세트
        </LogChip>

        {durationSec > 0 && (
          <LogChip>
            {formatDuration(
              durationSec,
            )}
          </LogChip>
        )}

        {volume > 0 && (
          <LogChip>
            {Math.round(
              volume,
            ).toLocaleString()}
            kg
          </LogChip>
        )}

        {timedSeconds > 0 && (
          <LogChip>
            시간 운동{' '}
            {formatDuration(
              timedSeconds,
            )}
          </LogChip>
        )}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────
// Detailed workout card
// ─────────────────────────────────────────────

function DetailedLogCard({
  log,
}: {
  log: WorkoutLog;
}) {
  const durationSec =
    getWorkoutDuration(
      log,
    );

  const volume =
    calcTotalVolume(
      log.sets,
    );

  const exerciseGroups =
    log.sets.reduce<
      Record<
        string,
        SetLog[]
      >
    >(
      (
        result,
        set,
      ) => {
        (
          result[
            set.exercise_name
          ] =
            result[
              set.exercise_name
            ] || []
        ).push(set);

        return result;
      },
      {},
    );

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60">
      <header className="border-b border-zinc-800/70 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">
              {log.routine_name}
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              {log.sets.length}세트 완료
            </p>
          </div>

          <div className="text-right">
            {durationSec > 0 && (
              <p className="text-xs font-medium text-zinc-400">
                {formatDuration(
                  durationSec,
                )}
              </p>
            )}

            {volume > 0 && (
              <p className="mt-1 text-[10px] text-blue-400">
                {Math.round(
                  volume,
                ).toLocaleString()}
                kg
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-5 px-4 py-4">
        {Object.entries(
          exerciseGroups,
        ).map(
          (
            [
              exerciseName,
              sets,
            ],
          ) => {
            const sortedSets =
              [...sets].sort(
                (a, b) =>
                  a.set_number -
                  b.set_number,
              );

            return (
              <div
                key={
                  exerciseName
                }
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-300">
                    {exerciseName}
                  </p>

                  <span className="text-[10px] text-zinc-600">
                    {sets.length}세트
                  </span>
                </div>

                <div className="mt-2 space-y-1.5">
                  {sortedSets.map(
                    (set) => (
                      <div
                        key={set.id}
                        className="grid grid-cols-[32px_1fr] rounded-xl bg-zinc-950/50 px-3 py-2.5 text-xs"
                      >
                        <span className="font-medium text-zinc-600">
                          {set.set_number}
                        </span>

                        <span className="font-medium text-zinc-300">
                          {setLabel(
                            set,
                          )}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          },
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────

function LogChip({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span className="rounded-lg bg-zinc-800/80 px-2.5 py-1.5 text-[10px] text-zinc-400">
      {children}
    </span>
  );
}

function getWorkoutDuration(
  log: WorkoutLog,
) {
  if (
    !log.finished_at
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(
      (
        new Date(
          log.finished_at,
        ).getTime() -
        new Date(
          log.started_at,
        ).getTime()
      ) /
        1000,
    ),
  );
}

function formatLogDate(
  value: string,
) {
  const date =
    new Date(value);

  return new Intl.DateTimeFormat(
    'ko-KR',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    },
  ).format(date);
}

function formatSelectedDate(
  value: string,
) {
  const [
    year,
    month,
    day,
  ] =
    value.split('-');

  return `${year}년 ${parseInt(
    month,
  )}월 ${parseInt(
    day,
  )}일`;
}

function formatCompactDuration(
  seconds: number,
) {
  const minutes =
    Math.round(
      seconds / 60,
    );

  if (
    minutes < 60
  ) {
    return `${minutes}분`;
  }

  const hours =
    Math.floor(
      minutes / 60,
    );

  const remainingMinutes =
    minutes % 60;

  if (
    remainingMinutes === 0
  ) {
    return `${hours}시간`;
  }

  return `${hours}h ${remainingMinutes}m`;
}