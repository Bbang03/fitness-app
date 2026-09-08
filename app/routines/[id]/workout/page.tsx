'use client';

import {
  type ComponentType,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useParams,
  useRouter,
} from 'next/navigation';

import {
  Check,
  ChevronLeft,
  Clock3,
  Dumbbell,
  Flame,
  Minus,
  Monitor,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trophy,
  X,
  Zap,
} from 'lucide-react';

import { useStore } from '@/lib/store';
import { useWakeLock } from '@/hooks/useWakeLock';

import {
  calcTotalVolume,
  elapsedSeconds,
  formatDuration,
  playBeep,
  requestNotificationPermission,
  sendNotification,
} from '@/lib/utils';

import type {
  RecordType,
  SetLog,
} from '@/lib/types';

// ─────────────────────────────────────────────
// Local UI Types
// ─────────────────────────────────────────────

interface SetDraft {
  weight: string;
  reps: string;
}

interface PreviousSession {
  id: string;
  date: string;
  startedAt: string;
  sets: SetLog[];
}

// ─────────────────────────────────────────────
// Start Screen
// ─────────────────────────────────────────────

function StartScreen({
  routineName,
  exercises,
  onStart,
  onCancel,
}: {
  routineName: string;

  exercises: {
    exercise_name: string;
    target_sets: number;
    target_reps: number;
    rest_seconds: number;
    record_type: RecordType;
  }[];

  onStart: () => void;
  onCancel: () => void;
}) {
  const totalSets = exercises.reduce(
    (sum, exercise) =>
      sum + exercise.target_sets,
    0,
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-10 pb-5">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/70 text-zinc-500 transition-colors hover:text-white"
          aria-label="뒤로 가기"
        >
          <ChevronLeft size={22} />
        </button>
      </header>

      <main className="flex-1 px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
          Today&apos;s Workout
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {routineName}
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          운동 구성을 확인하고 시작하세요.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <SummaryCard
            icon={Dumbbell}
            label="운동"
            value={`${exercises.length}`}
            unit="개"
          />

          <SummaryCard
            icon={Flame}
            label="목표 세트"
            value={`${totalSets}`}
            unit="세트"
          />
        </div>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              운동 구성
            </h2>

            <span className="text-xs text-zinc-600">
              {exercises.length}개
            </span>
          </div>

          <div className="space-y-2">
            {exercises.map((exercise, index) => (
              <div
                key={`${exercise.exercise_name}-${index}`}
                className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xs font-bold text-zinc-400">
                  {index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {exercise.exercise_name}
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    {exercise.target_sets}세트
                    {' · '}

                    {exercise.record_type === 'time'
                      ? `목표 ${formatDuration(
                          exercise.target_reps,
                        )}`
                      : `${exercise.target_reps}회`}

                    {' · '}
                    휴식 {exercise.rest_seconds}초
                  </p>
                </div>

                <RecordBadge
                  type={exercise.record_type}
                />
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-5 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onStart}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-base font-bold text-white transition-colors hover:bg-blue-500"
        >
          <Zap
            size={19}
            fill="currentColor"
          />

          운동 시작
        </button>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────
// Exercise Screen
// ─────────────────────────────────────────────

function ExerciseScreen({
  exerciseName,

  exerciseIndex,
  totalExercises,

  currentSet,
  targetSets,
  targetReps,
  restSeconds,

  recordType,

  completedSets,
  previousSessions,

  elapsedSec,
  isWakeLocked,

  restTimer,

  nextExerciseName,

  onLogSet,
  onCancel,

  onAddSet,
  onRemoveSet,

  onSkipRest,
  onAdjustRest,
}: {
  exerciseName: string;

  exerciseIndex: number;
  totalExercises: number;

  currentSet: number;
  targetSets: number;
  targetReps: number;
  restSeconds: number;

  recordType: RecordType;

  completedSets: SetLog[];

  previousSessions: PreviousSession[];

  elapsedSec: number;

  isWakeLocked: boolean;

  restTimer: {
    endTimestamp: number;
    totalSeconds: number;
  } | null;

  nextExerciseName: string | null;

  onLogSet: (
    weight: number,
    reps: number,
    duration?: number,
  ) => void;

  onCancel: () => void;

  onAddSet: () => void;
  onRemoveSet: () => void;

  onSkipRest: () => void;

  onAdjustRest: (
    seconds: number,
  ) => void;
}) {
  const [
    confirmCancel,
    setConfirmCancel,
  ] = useState(false);

  const [
    drafts,
    setDrafts,
  ] = useState<SetDraft[]>([]);

  const draftExerciseRef =
    useRef('');

  const loggingGuard =
    useRef(false);

  // ─────────────────────────────────────────────
  // Set Drafts
  // ─────────────────────────────────────────────

  useEffect(() => {
    const changedExercise =
      draftExerciseRef.current !==
      exerciseName;

    const latestPrevious =
      previousSessions[0]?.sets ??
      [];

    setDrafts((existing) =>
      Array.from({
        length: targetSets,
      }).map((_, index) => {
        const setNumber =
          index + 1;

        const completed =
          completedSets.find(
            (set) =>
              set.set_number ===
              setNumber,
          );

        if (completed) {
          return {
            weight: String(
              completed.weight_kg ?? 0,
            ),

            reps: String(
              completed.reps ??
                targetReps,
            ),
          };
        }

        if (
          !changedExercise &&
          existing[index]
        ) {
          return existing[index];
        }

        const previous =
          latestPrevious.find(
            (set) =>
              set.set_number ===
              setNumber,
          );

        return {
          weight:
            previous &&
            recordType ===
              'weight_reps'
              ? String(
                  previous.weight_kg,
                )
              : '',

          reps:
            previous &&
            recordType !==
              'time'
              ? String(
                  previous.reps,
                )
              : String(
                  targetReps,
                ),
        };
      }),
    );

    draftExerciseRef.current =
      exerciseName;
  }, [
    exerciseName,
    targetSets,
    completedSets,
    previousSessions,
    recordType,
    targetReps,
  ]);

  useEffect(() => {
    loggingGuard.current =
      false;
  }, [
    exerciseName,
    currentSet,
  ]);

  const updateDraft = (
    index: number,
    patch: Partial<SetDraft>,
  ) => {
    setDrafts((current) =>
      current.map(
        (draft, draftIndex) =>
          draftIndex === index
            ? {
                ...draft,
                ...patch,
              }
            : draft,
      ),
    );
  };

  const adjustWeight = (
    index: number,
    amount: number,
  ) => {
    const current =
      parseFloat(
        drafts[index]?.weight ??
          '0',
      ) || 0;

    const next =
      Math.max(
        0,
        Math.round(
          (current + amount) * 4,
        ) / 4,
      );

    updateDraft(index, {
      weight: String(
        next % 1 === 0
          ? next
          : next.toFixed(1),
      ),
    });
  };

  const adjustReps = (
    index: number,
    amount: number,
  ) => {
    const current =
      parseInt(
        drafts[index]?.reps ??
          '0',
      ) || 0;

    updateDraft(index, {
      reps: String(
        Math.max(
          1,
          current + amount,
        ),
      ),
    });
  };

  // ─────────────────────────────────────────────
  // Time Exercise Countdown Timer
  // ─────────────────────────────────────────────
  //
  // timerRemainingMs:
  //   pause 상태에서 남은 시간
  //
  // timerEndsAt:
  //   실행 중일 때 countdown 종료 timestamp
  //
  // timedAccumulatedMs:
  //   실제로 타이머가 실행된 누적 시간
  //
  // timedStartedAt:
  //   현재 실행 구간 시작 timestamp
  //
  // interval 횟수가 아니라 Date.now() 차이로 계산.
  // ─────────────────────────────────────────────

  const [
    timerRemainingMs,
    setTimerRemainingMs,
  ] = useState(
    targetReps * 1000,
  );

  const [
    timerEndsAt,
    setTimerEndsAt,
  ] = useState<number | null>(
    null,
  );

  const [
    timedAccumulatedMs,
    setTimedAccumulatedMs,
  ] = useState(0);

  const [
    timedStartedAt,
    setTimedStartedAt,
  ] = useState<number | null>(
    null,
  );

  const [
    ,
    setTimerTick,
  ] = useState(0);

  const timerNotified =
    useRef(false);

  const timerRunning =
    timerEndsAt !== null &&
    timedStartedAt !== null;

  const getRemainingMs =
    useCallback(() => {
      if (
        timerEndsAt === null
      ) {
        return Math.max(
          0,
          timerRemainingMs,
        );
      }

      return Math.max(
        0,
        timerEndsAt -
          Date.now(),
      );
    }, [
      timerEndsAt,
      timerRemainingMs,
    ]);

  const getTimedElapsedMs =
    useCallback(() => {
      if (
        timedStartedAt === null
      ) {
        return timedAccumulatedMs;
      }

      return (
        timedAccumulatedMs +
        Math.max(
          0,
          Date.now() -
            timedStartedAt,
        )
      );
    }, [
      timedAccumulatedMs,
      timedStartedAt,
    ]);

  // 새 세트 / 새 운동으로 이동하면 타이머 초기화
  useEffect(() => {
    setTimerRemainingMs(
      targetReps * 1000,
    );

    setTimerEndsAt(
      null,
    );

    setTimedAccumulatedMs(
      0,
    );

    setTimedStartedAt(
      null,
    );

    timerNotified.current =
      false;

    setTimerTick(
      (tick) =>
        tick + 1,
    );
  }, [
    exerciseName,
    currentSet,
    targetReps,
  ]);

  // Countdown tick
  useEffect(() => {
    if (
      !timerRunning ||
      timerEndsAt === null ||
      timedStartedAt === null
    ) {
      return;
    }

    const interval =
      window.setInterval(() => {
        const now =
          Date.now();

        const remaining =
          timerEndsAt -
          now;

        setTimerTick(
          (tick) =>
            tick + 1,
        );

        if (
          remaining <= 0 &&
          !timerNotified.current
        ) {
          timerNotified.current =
            true;

          const elapsedDelta =
            Math.max(
              0,
              now -
                timedStartedAt,
            );

          setTimedAccumulatedMs(
            (current) =>
              current +
              elapsedDelta,
          );

          setTimerRemainingMs(
            0,
          );

          setTimerEndsAt(
            null,
          );

          setTimedStartedAt(
            null,
          );

          playBeep();

          sendNotification(
            '목표 시간 완료!',
            `${exerciseName} ${currentSet + 1}세트의 목표 시간이 끝났습니다.`,
          );
        }
      }, 200);

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    timerRunning,
    timerEndsAt,
    timedStartedAt,
    exerciseName,
    currentSet,
  ]);

  const countdownRemainingMs =
    getRemainingMs();

  const countdownRemainingSeconds =
    Math.ceil(
      countdownRemainingMs /
        1000,
    );

  const timedElapsedSeconds =
    Math.floor(
      getTimedElapsedMs() /
        1000,
    );

  const startCountdown = () => {
    if (timerRunning) {
      return;
    }

    /*
     * 이미 00:00까지 끝난 상태에서
     * 다시 시작을 누르면 해당 세트를
     * 목표 시간으로 완전히 초기화한 뒤 재시작.
     */
    if (
      getRemainingMs() <= 0
    ) {
      const now =
        Date.now();

      setTimerRemainingMs(
        targetReps * 1000,
      );

      setTimedAccumulatedMs(
        0,
      );

      setTimedStartedAt(
        now,
      );

      setTimerEndsAt(
        now +
          targetReps *
            1000,
      );

      timerNotified.current =
        false;

      return;
    }

    const now =
      Date.now();

    const remaining =
      getRemainingMs();

    setTimerRemainingMs(
      remaining,
    );

    setTimedStartedAt(
      now,
    );

    setTimerEndsAt(
      now + remaining,
    );

    timerNotified.current =
      false;
  };

  const pauseCountdown = () => {
    if (
      timerEndsAt === null ||
      timedStartedAt === null
    ) {
      return;
    }

    const now =
      Date.now();

    const remaining =
      Math.max(
        0,
        timerEndsAt -
          now,
      );

    const elapsedDelta =
      Math.max(
        0,
        now -
          timedStartedAt,
      );

    setTimerRemainingMs(
      remaining,
    );

    setTimedAccumulatedMs(
      (current) =>
        current +
        elapsedDelta,
    );

    setTimerEndsAt(
      null,
    );

    setTimedStartedAt(
      null,
    );
  };

  const resetCountdown = () => {
    setTimerRemainingMs(
      targetReps * 1000,
    );

    setTimerEndsAt(
      null,
    );

    setTimedAccumulatedMs(
      0,
    );

    setTimedStartedAt(
      null,
    );

    timerNotified.current =
      false;

    setTimerTick(
      (tick) =>
        tick + 1,
    );
  };

  const adjustCountdown = (
    seconds: number,
  ) => {
    const currentRemaining =
      getRemainingMs();

    const nextRemaining =
      Math.max(
        0,
        currentRemaining +
          seconds * 1000,
      );

    if (timerRunning) {
      if (
        nextRemaining <= 0
      ) {
        const now =
          Date.now();

        const elapsedDelta =
          timedStartedAt !==
          null
            ? Math.max(
                0,
                now -
                  timedStartedAt,
              )
            : 0;

        setTimedAccumulatedMs(
          (current) =>
            current +
            elapsedDelta,
        );

        setTimerRemainingMs(
          0,
        );

        setTimerEndsAt(
          null,
        );

        setTimedStartedAt(
          null,
        );

        timerNotified.current =
          true;

        playBeep();

        sendNotification(
          '목표 시간 완료!',
          `${exerciseName} ${currentSet + 1}세트의 목표 시간이 끝났습니다.`,
        );

        return;
      }

      setTimerRemainingMs(
        nextRemaining,
      );

      setTimerEndsAt(
        Date.now() +
          nextRemaining,
      );

      timerNotified.current =
        false;

      return;
    }

    setTimerRemainingMs(
      nextRemaining,
    );

    if (
      nextRemaining > 0
    ) {
      timerNotified.current =
        false;
    }

    setTimerTick(
      (tick) =>
        tick + 1,
    );
  };

  // ─────────────────────────────────────────────
  // Complete Current Set
  // ─────────────────────────────────────────────

  const completeCurrentSet =
    () => {
      if (
        loggingGuard.current ||
        restTimer
      ) {
        return;
      }

      const draft =
        drafts[currentSet];

      if (!draft) {
        return;
      }

      if (
        recordType === 'time'
      ) {
        const duration =
          Math.floor(
            getTimedElapsedMs() /
              1000,
          );

        if (
          duration <= 0
        ) {
          return;
        }

        loggingGuard.current =
          true;

        setTimerEndsAt(
          null,
        );

        setTimedStartedAt(
          null,
        );

        onLogSet(
          0,
          0,
          duration,
        );

        return;
      }

      if (
        recordType ===
        'reps_only'
      ) {
        const parsedReps =
          parseInt(
            draft.reps,
          ) || 0;

        if (
          parsedReps <= 0
        ) {
          return;
        }

        loggingGuard.current =
          true;

        onLogSet(
          0,
          parsedReps,
        );

        return;
      }

      const parsedReps =
        parseInt(
          draft.reps,
        ) || 0;

      const parsedWeight =
        parseFloat(
          draft.weight,
        ) || 0;

      if (
        parsedReps <= 0
      ) {
        return;
      }

      loggingGuard.current =
        true;

      onLogSet(
        parsedWeight,
        parsedReps,
      );
    };

  // ─────────────────────────────────────────────
  // Derived Data
  // ─────────────────────────────────────────────

  const todayVolume =
    completedSets.reduce(
      (sum, set) =>
        sum +
        set.weight_kg *
          set.reps,
      0,
    );

  const previousVolume =
    (
      previousSessions[0]
        ?.sets ?? []
    ).reduce(
      (sum, set) =>
        sum +
        set.weight_kg *
          set.reps,
      0,
    );

  const canRemoveSet =
    targetSets > 1 &&
    targetSets >
      currentSet + 1;

  const exerciseProgress =
    totalExercises > 0
      ? (
          (exerciseIndex + 1) /
          totalExercises
        ) *
        100
      : 0;

  const timerGoalProgress =
    targetReps > 0
      ? Math.min(
          100,
          (
            timedElapsedSeconds /
            targetReps
          ) *
            100,
        )
      : 0;

  const timerFinished =
    countdownRemainingSeconds <=
      0 &&
    timedElapsedSeconds > 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-zinc-950/95 backdrop-blur-xl">
        <div className="px-5 pt-9 pb-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setConfirmCancel(
                  true,
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
              aria-label="운동 종료"
            >
              <X size={20} />
            </button>

            <div className="flex max-w-[150px] items-center justify-center gap-1">
              {Array.from({
                length:
                  totalExercises,
              }).map(
                (_, index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      index ===
                      exerciseIndex
                        ? 'w-6 bg-blue-500'
                        : index <
                            exerciseIndex
                          ? 'w-3 bg-emerald-500'
                          : 'w-3 bg-zinc-700'
                    }`}
                  />
                ),
              )}
            </div>

            <div className="flex min-w-[62px] items-center justify-end gap-2">
              {isWakeLocked && (
                <Monitor
                  size={13}
                  className="text-emerald-400"
                />
              )}

              <span className="text-sm tabular-nums text-zinc-400">
                {formatDuration(
                  elapsedSec,
                )}
              </span>
            </div>
          </div>

          <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-zinc-900">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${exerciseProgress}%`,
              }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Exercise Info */}
        <section className="px-5 pt-7 pb-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-400">
              운동{' '}
              {exerciseIndex + 1}{' '}
              / {totalExercises}
            </p>

            <RecordBadge
              type={recordType}
            />
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight">
            {exerciseName}
          </h1>

          {recordType ===
            'weight_reps' && (
            <div className="mt-5 flex items-end gap-7">
              <div>
                <p className="text-[10px] text-zinc-600">
                  오늘 볼륨
                </p>

                <p className="mt-1 text-xl font-bold">
                  {todayVolume.toLocaleString()}

                  <span className="ml-1 text-xs font-medium text-zinc-600">
                    kg
                  </span>
                </p>
              </div>

              <div>
                <p className="text-[10px] text-zinc-600">
                  지난 운동 볼륨
                </p>

                <p className="mt-1 text-sm font-semibold text-zinc-500">
                  {previousVolume > 0
                    ? `${previousVolume.toLocaleString()}kg`
                    : '기록 없음'}
                </p>
              </div>
            </div>
          )}

          {recordType ===
            'reps_only' && (
            <p className="mt-4 text-sm text-zinc-500">
              목표{' '}
              <span className="font-semibold text-zinc-300">
                {targetReps}회
              </span>
              {' · '}
              휴식{' '}
              {restSeconds}초
            </p>
          )}

          {recordType ===
            'time' && (
            <p className="mt-4 text-sm text-zinc-500">
              목표 시간{' '}
              <span className="font-semibold text-zinc-300">
                {formatDuration(
                  targetReps,
                )}
              </span>
              {' · '}
              휴식{' '}
              {restSeconds}초
            </p>
          )}
        </section>

        {/* Set Table */}
        <section className="border-y border-zinc-900 bg-zinc-950/50 px-4 py-5">
          <SetTableHeader
            recordType={
              recordType
            }
          />

          <div className="mt-2 space-y-2">
            {Array.from({
              length: targetSets,
            }).map(
              (_, index) => {
                const setNumber =
                  index + 1;

                const completed =
                  completedSets.find(
                    (set) =>
                      set.set_number ===
                      setNumber,
                  );

                const isCurrent =
                  index ===
                  currentSet;

                const isFuture =
                  index >
                  currentSet;

                const draft =
                  drafts[index] ?? {
                    weight: '',
                    reps: String(
                      targetReps,
                    ),
                  };

                return (
                  <SetRow
                    key={index}
                    setNumber={
                      setNumber
                    }
                    recordType={
                      recordType
                    }
                    draft={draft}
                    completedSet={
                      completed ??
                      null
                    }
                    isCurrent={
                      isCurrent
                    }
                    isFuture={
                      isFuture
                    }
                    targetSeconds={
                      targetReps
                    }
                    currentRemainingSeconds={
                      isCurrent
                        ? countdownRemainingSeconds
                        : targetReps
                    }
                    timedElapsedSeconds={
                      isCurrent
                        ? timedElapsedSeconds
                        : 0
                    }
                    restActive={
                      Boolean(
                        restTimer,
                      )
                    }
                    onWeightChange={(
                      value,
                    ) =>
                      updateDraft(
                        index,
                        {
                          weight:
                            value,
                        },
                      )
                    }
                    onRepsChange={(
                      value,
                    ) =>
                      updateDraft(
                        index,
                        {
                          reps:
                            value,
                        },
                      )
                    }
                    onWeightMinus={() =>
                      adjustWeight(
                        index,
                        -2.5,
                      )
                    }
                    onWeightPlus={() =>
                      adjustWeight(
                        index,
                        2.5,
                      )
                    }
                    onRepsMinus={() =>
                      adjustReps(
                        index,
                        -1,
                      )
                    }
                    onRepsPlus={() =>
                      adjustReps(
                        index,
                        1,
                      )
                    }
                    onComplete={
                      completeCurrentSet
                    }
                  />
                );
              },
            )}
          </div>

          <div className="mt-5 flex items-center justify-between px-2">
            <button
              type="button"
              onClick={onAddSet}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-400 transition-colors hover:text-blue-300"
            >
              <Plus size={19} />
              세트 추가
            </button>

            <button
              type="button"
              disabled={
                !canRemoveSet
              }
              onClick={
                onRemoveSet
              }
              className="flex items-center gap-1.5 text-sm font-semibold text-amber-400 transition-colors disabled:cursor-not-allowed disabled:opacity-25"
            >
              <Minus size={19} />
              세트 삭제
            </button>
          </div>
        </section>

        {/* Countdown Timer */}
        {recordType ===
          'time' && (
          <section className="px-5 pt-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    {currentSet + 1}
                    세트
                  </p>

                  <p className="mt-1 text-[11px] text-zinc-600">
                    카운트다운 타이머
                  </p>
                </div>

                <div className="flex items-center gap-1.5 rounded-lg bg-zinc-950 px-2.5 py-1.5">
                  <Clock3
                    size={11}
                    className="text-zinc-600"
                  />

                  <span className="text-[10px] text-zinc-500">
                    목표{' '}
                    {formatDuration(
                      targetReps,
                    )}
                  </span>
                </div>
              </div>

              <div className="py-7 text-center">
                <p
                  className={`text-6xl font-bold tabular-nums tracking-tight ${
                    countdownRemainingSeconds <=
                    5 &&
                    timerRunning
                      ? 'text-orange-400'
                      : timerFinished
                        ? 'text-emerald-400'
                        : 'text-white'
                  }`}
                >
                  {formatDuration(
                    countdownRemainingSeconds,
                  )}
                </p>

                <div className="mt-4 flex items-center justify-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      timerRunning
                        ? 'animate-pulse bg-emerald-400'
                        : timerFinished
                          ? 'bg-emerald-400'
                          : timedElapsedSeconds >
                              0
                            ? 'bg-orange-400'
                            : 'bg-zinc-700'
                    }`}
                  />

                  <span className="text-xs text-zinc-500">
                    {timerRunning
                      ? '타이머 진행 중'
                      : timerFinished
                        ? '목표 시간 완료'
                        : timedElapsedSeconds >
                            0
                          ? '일시정지'
                          : '준비'}
                  </span>
                </div>

                {timedElapsedSeconds >
                  0 && (
                  <p className="mt-3 text-[11px] text-zinc-600">
                    실제 수행{' '}
                    <span className="font-medium text-zinc-400">
                      {formatDuration(
                        timedElapsedSeconds,
                      )}
                    </span>
                  </p>
                )}
              </div>

              {/* Goal progress */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-600">
                    목표 진행률
                  </span>

                  <span className="text-[10px] font-medium text-zinc-500">
                    {Math.round(
                      timerGoalProgress,
                    )}
                    %
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      timerGoalProgress >=
                      100
                        ? 'bg-emerald-500'
                        : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${timerGoalProgress}%`,
                    }}
                  />
                </div>
              </div>

              {/* Main timer button */}
              <div className="mt-6">
                {!timerRunning ? (
                  <button
                    type="button"
                    onClick={
                      startCountdown
                    }
                    disabled={
                      Boolean(
                        restTimer,
                      )
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600"
                  >
                    <Play
                      size={18}
                      fill="currentColor"
                    />

                    {timerFinished
                      ? '다시 시작'
                      : timedElapsedSeconds >
                          0
                        ? '계속 진행'
                        : '타이머 시작'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={
                      pauseCountdown
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white transition-colors hover:bg-orange-400"
                  >
                    <Pause
                      size={18}
                      fill="currentColor"
                    />

                    일시정지
                  </button>
                )}
              </div>

              {/* Timer controls */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    adjustCountdown(
                      -15,
                    )
                  }
                  className="rounded-xl border border-zinc-800 bg-zinc-950/60 py-3 text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-800"
                >
                  -15초
                </button>

                <button
                  type="button"
                  onClick={
                    resetCountdown
                  }
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 py-3 text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-800"
                >
                  <RotateCcw
                    size={13}
                  />

                  초기화
                </button>

                <button
                  type="button"
                  onClick={() =>
                    adjustCountdown(
                      15,
                    )
                  }
                  className="rounded-xl border border-zinc-800 bg-zinc-950/60 py-3 text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-800"
                >
                  +15초
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Current Set Helper */}
        {recordType !==
          'time' &&
          !restTimer && (
            <section className="px-5 pt-5">
              <div className="rounded-2xl border border-blue-500/15 bg-blue-500/[0.05] px-4 py-3">
                <p className="text-xs leading-relaxed text-zinc-500">
                  현재{' '}
                  <span className="font-semibold text-blue-400">
                    {currentSet + 1}
                    세트
                  </span>
                  의 값을 조절한 뒤 완료 버튼을
                  눌러주세요.
                </p>
              </div>
            </section>
          )}

        {/* Next Exercise */}
        {nextExerciseName && (
          <section className="px-5 pt-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700">
              Next Exercise
            </p>

            <p className="mt-1.5 text-sm font-medium text-zinc-400">
              {nextExerciseName}
            </p>
          </section>
        )}

        {/* Previous History */}
        <section className="px-5 pt-8 pb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">
                지난 기록
              </h2>

              <p className="mt-1 text-xs text-zinc-600">
                최근 같은 운동의 수행 기록
              </p>
            </div>

            <RotateCcw
              size={17}
              className="text-zinc-700"
            />
          </div>

          {previousSessions.length ===
          0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center">
              <p className="text-sm text-zinc-500">
                아직 이전 기록이 없어요.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {previousSessions.map(
                (session) => (
                  <PreviousSessionCard
                    key={
                      session.id
                    }
                    session={
                      session
                    }
                    recordType={
                      recordType
                    }
                  />
                ),
              )}
            </div>
          )}
        </section>

        <div className="h-28" />
      </main>

      {/* Rest Dock */}
      {restTimer ? (
        <RestDock
          endTimestamp={
            restTimer.endTimestamp
          }
          totalSeconds={
            restTimer.totalSeconds
          }
          onSkip={
            onSkipRest
          }
          onAdjust={
            onAdjustRest
          }
        />
      ) : (
        <footer className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-white/[0.06] bg-zinc-950/95 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur-xl">
          <button
            type="button"
            onClick={
              completeCurrentSet
            }
            disabled={
              recordType ===
                'time' &&
              timedElapsedSeconds ===
                0
            }
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-base font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            <Check
              size={20}
              strokeWidth={3}
            />

            {recordType ===
              'time' &&
            timedElapsedSeconds ===
              0
              ? '타이머를 시작해주세요'
              : `${currentSet + 1}세트 완료`}
          </button>
        </footer>
      )}

      {/* Cancel Modal */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-t-3xl border-t border-zinc-800 bg-zinc-900 p-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10">
              <X
                size={20}
                className="text-red-400"
              />
            </div>

            <h3 className="mt-4 text-xl font-bold">
              운동을 종료할까요?
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              운동을 종료하면 아직 완료하지 않은
              세트는 저장되지 않습니다.
            </p>

            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-red-500"
              >
                운동 종료
              </button>

              <button
                type="button"
                onClick={() =>
                  setConfirmCancel(
                    false,
                  )
                }
                className="w-full rounded-2xl bg-zinc-800 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
              >
                계속 운동하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Set Row
// ─────────────────────────────────────────────

function SetRow({
  setNumber,
  recordType,

  draft,

  completedSet,

  isCurrent,
  isFuture,

  targetSeconds,
  currentRemainingSeconds,
  timedElapsedSeconds,

  restActive,

  onWeightChange,
  onRepsChange,

  onWeightMinus,
  onWeightPlus,

  onRepsMinus,
  onRepsPlus,

  onComplete,
}: {
  setNumber: number;

  recordType: RecordType;

  draft: SetDraft;

  completedSet:
    SetLog | null;

  isCurrent: boolean;
  isFuture: boolean;

  targetSeconds: number;
  currentRemainingSeconds: number;
  timedElapsedSeconds: number;

  restActive: boolean;

  onWeightChange: (
    value: string,
  ) => void;

  onRepsChange: (
    value: string,
  ) => void;

  onWeightMinus: () => void;
  onWeightPlus: () => void;

  onRepsMinus: () => void;
  onRepsPlus: () => void;

  onComplete: () => void;
}) {
  const isCompleted =
    Boolean(
      completedSet,
    );

  const canComplete =
    isCurrent &&
    !restActive &&
    !isCompleted &&
    (
      recordType !==
        'time' ||
      timedElapsedSeconds >
        0
    );

  if (
    recordType ===
    'weight_reps'
  ) {
    return (
      <div
        className={`grid grid-cols-[48px_1fr_1fr_52px] gap-2 rounded-2xl p-1.5 transition-colors ${
          isCurrent
            ? 'bg-blue-500/[0.06]'
            : ''
        }`}
      >
        <SetNumberBox
          number={setNumber}
          completed={
            isCompleted
          }
          current={
            isCurrent
          }
        />

        <NumberCell
          value={
            isCompleted
              ? String(
                  completedSet?.weight_kg ??
                    0,
                )
              : draft.weight
          }
          disabled={
            isCompleted
          }
          decimal
          onChange={
            onWeightChange
          }
          onMinus={
            onWeightMinus
          }
          onPlus={
            onWeightPlus
          }
        />

        <NumberCell
          value={
            isCompleted
              ? String(
                  completedSet?.reps ??
                    0,
                )
              : draft.reps
          }
          disabled={
            isCompleted
          }
          onChange={
            onRepsChange
          }
          onMinus={
            onRepsMinus
          }
          onPlus={
            onRepsPlus
          }
        />

        <CompleteCell
          completed={
            isCompleted
          }
          enabled={
            canComplete
          }
          future={
            isFuture
          }
          onClick={
            onComplete
          }
        />
      </div>
    );
  }

  if (
    recordType ===
    'reps_only'
  ) {
    return (
      <div
        className={`grid grid-cols-[56px_1fr_64px] gap-3 rounded-2xl p-1.5 transition-colors ${
          isCurrent
            ? 'bg-blue-500/[0.06]'
            : ''
        }`}
      >
        <SetNumberBox
          number={setNumber}
          completed={
            isCompleted
          }
          current={
            isCurrent
          }
        />

        <NumberCell
          value={
            isCompleted
              ? String(
                  completedSet?.reps ??
                    0,
                )
              : draft.reps
          }
          disabled={
            isCompleted
          }
          onChange={
            onRepsChange
          }
          onMinus={
            onRepsMinus
          }
          onPlus={
            onRepsPlus
          }
        />

        <CompleteCell
          completed={
            isCompleted
          }
          enabled={
            canComplete
          }
          future={
            isFuture
          }
          onClick={
            onComplete
          }
        />
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-[56px_1fr_64px] gap-3 rounded-2xl p-1.5 transition-colors ${
        isCurrent
          ? 'bg-blue-500/[0.06]'
          : ''
      }`}
    >
      <SetNumberBox
        number={setNumber}
        completed={
          isCompleted
        }
        current={
          isCurrent
        }
      />

      <div
        className={`flex h-14 items-center justify-center rounded-xl border text-lg font-bold tabular-nums ${
          isCompleted
            ? 'border-emerald-500/10 bg-emerald-500/[0.06] text-emerald-300'
            : isCurrent
              ? 'border-blue-500/20 bg-blue-500/[0.05] text-white'
              : 'border-zinc-800 bg-zinc-900 text-zinc-600'
        }`}
      >
        {isCompleted
          ? formatDuration(
              completedSet
                ?.duration_seconds ??
                0,
            )
          : isCurrent
            ? formatDuration(
                currentRemainingSeconds,
              )
            : formatDuration(
                targetSeconds,
              )}
      </div>

      <CompleteCell
        completed={
          isCompleted
        }
        enabled={
          canComplete
        }
        future={
          isFuture
        }
        onClick={
          onComplete
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Rest Dock
// ─────────────────────────────────────────────

function RestDock({
  endTimestamp,
  totalSeconds,

  onSkip,
  onAdjust,
}: {
  endTimestamp: number;
  totalSeconds: number;

  onSkip: () => void;

  onAdjust: (
    seconds: number,
  ) => void;
}) {
  const [
    ,
    setTick,
  ] = useState(0);

  const notified =
    useRef(false);

  useEffect(() => {
    notified.current =
      false;
  }, [
    endTimestamp,
  ]);

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setTick(
          (current) =>
            current + 1,
        );

        if (
          Date.now() >=
            endTimestamp &&
          !notified.current
        ) {
          notified.current =
            true;

          playBeep();

          sendNotification(
            '휴식 완료!',
            '다음 세트를 시작하세요.',
          );

          onSkip();
        }
      }, 250);

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    endTimestamp,
    onSkip,
  ]);

  const remaining =
    Math.max(
      0,
      Math.ceil(
        (
          endTimestamp -
          Date.now()
        ) /
          1000,
      ),
    );

  const progress =
    totalSeconds > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (
              1 -
              remaining /
                totalSeconds
            ) *
              100,
          ),
        )
      : 100;

  return (
    <footer className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 rounded-t-3xl border-t border-red-500/20 bg-zinc-950/95 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl">
      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-red-500" />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-red-400">
            휴식 시간
          </p>

          <p className="mt-1 text-3xl font-bold tabular-nums">
            {formatDuration(
              remaining,
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onAdjust(-15)
            }
            className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white transition-colors active:bg-red-600"
            aria-label="휴식 15초 감소"
          >
            <Minus size={19} />
          </button>

          <button
            type="button"
            onClick={onSkip}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 transition-colors active:bg-zinc-700"
            aria-label="휴식 건너뛰기"
          >
            <SkipForward
              size={18}
              fill="currentColor"
            />
          </button>

          <button
            type="button"
            onClick={() =>
              onAdjust(15)
            }
            className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white transition-colors active:bg-red-600"
            aria-label="휴식 15초 증가"
          >
            <Plus size={19} />
          </button>
        </div>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-red-500 transition-all duration-200"
          style={{
            width: `${progress}%`,
          }}
        />
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────
// Completion Screen
// ─────────────────────────────────────────────

function CompletionScreen({
  routineName,
  startedAt,
  completedSets,

  onFinish,

  isSaving,
  saveError,
}: {
  routineName: string;

  startedAt: string;

  completedSets: SetLog[];

  onFinish: () =>
    Promise<void>;

  isSaving: boolean;

  saveError: string;
}) {
  const durationSec =
    elapsedSeconds(
      startedAt,
    );

  const totalVolume =
    calcTotalVolume(
      completedSets,
    );

  const totalTimedSeconds =
    completedSets.reduce(
      (sum, set) =>
        sum +
        (
          set.duration_seconds ??
          0
        ),
      0,
    );

  const exerciseGroups =
    completedSets.reduce<
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
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 px-5 pt-12">
        <section className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10">
            <Trophy
              size={30}
              className="text-emerald-400"
            />
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
            Workout Complete
          </p>

          <h1 className="mt-2 text-2xl font-bold">
            운동 완료!
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            {routineName}
          </p>
        </section>

        <section className="mt-8 grid grid-cols-3 gap-2">
          <CompletionMetric
            label="운동 시간"
            value={formatDuration(
              durationSec,
            )}
          />

          <CompletionMetric
            label="총 세트"
            value={`${completedSets.length}`}
          />

          <CompletionMetric
            label="총 볼륨"
            value={
              totalVolume > 0
                ? `${totalVolume.toLocaleString()}kg`
                : '—'
            }
          />
        </section>

        {totalTimedSeconds >
          0 && (
          <div className="mt-3 rounded-2xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                시간 기반 운동
              </span>

              <span className="text-sm font-bold text-blue-400">
                {formatDuration(
                  totalTimedSeconds,
                )}
              </span>
            </div>
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles
              size={15}
              className="text-blue-400"
            />

            <h2 className="text-sm font-semibold">
              운동 요약
            </h2>
          </div>

          <div className="space-y-2">
            {Object.entries(
              exerciseGroups,
            ).map(
              ([name, sets]) => (
                <div
                  key={name}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {name}
                    </p>

                    <span className="text-xs text-zinc-600">
                      {sets.length}
                      세트
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {sets.map(
                      (set) => (
                        <span
                          key={set.id}
                          className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-400"
                        >
                          {setLabel(
                            set,
                            set.record_type ??
                              'weight_reps',
                          )}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>

        <div className="h-28" />
      </main>

      <footer className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-zinc-800 bg-zinc-950/95 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur-xl">
        {saveError && (
          <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">
            {saveError}
          </p>
        )}

        <button
          type="button"
          disabled={isSaving}
          onClick={() => {
            void onFinish();
          }}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-colors ${
            isSaving
              ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          <Check size={19} />

          {isSaving
            ? '기록 저장 중...'
            : '운동 기록 저장'}
        </button>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function WorkoutPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const routineId =
    params.id as string;

  const {
    currentUser,

    routines,

    activeWorkout,

    workoutLogs,

    startWorkout,

    logSet,

    clearRestTimer,

    finishWorkout,

    cancelWorkout,
  } = useStore();

  const user =
    currentUser();

  const routine =
    routines.find(
      (routineItem) =>
        routineItem.id ===
        routineId,
    );

  const isWorkoutInProgress =
    activeWorkout?.routineId ===
      routineId &&
    activeWorkout.phase !==
      'complete';

  const isWakeLocked =
    useWakeLock(
      isWorkoutInProgress,
    );

  const [
    elapsedSec,
    setElapsedSec,
  ] = useState(0);

  const [
    isFinishing,
    setIsFinishing,
  ] = useState(false);

  const [
    finishError,
    setFinishError,
  ] = useState('');

  // ─────────────────────────────────────────────
  // Auth / Routine Guard
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      router.replace(
        '/login',
      );

      return;
    }

    if (!routine) {
      router.replace(
        '/routines',
      );
    }
  }, [
    user?.id,
    routine,
    router,
  ]);

  // ─────────────────────────────────────────────
  // Whole Workout Timer
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (
      !activeWorkout?.startedAt
    ) {
      return;
    }

    setElapsedSec(
      elapsedSeconds(
        activeWorkout.startedAt,
      ),
    );

    const interval =
      window.setInterval(() => {
        setElapsedSec(
          elapsedSeconds(
            activeWorkout.startedAt,
          ),
        );
      }, 1000);

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    activeWorkout?.startedAt,
  ]);

  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  // ─────────────────────────────────────────────
  // Start
  // ─────────────────────────────────────────────

  const handleStart =
    useCallback(() => {
      if (activeWorkout) {
        cancelWorkout();
      }

      startWorkout(
        routineId,
      );
    }, [
      activeWorkout,
      cancelWorkout,
      routineId,
      startWorkout,
    ]);

  // ─────────────────────────────────────────────
  // Cancel
  // ─────────────────────────────────────────────

  const handleCancel =
    useCallback(() => {
      cancelWorkout();

      router.push(
        '/routines',
      );
    }, [
      cancelWorkout,
      router,
    ]);

  // ─────────────────────────────────────────────
  // Finish
  // ─────────────────────────────────────────────

  const handleFinish =
    useCallback(
      async () => {
        if (
          isFinishing
        ) {
          return;
        }

        setIsFinishing(
          true,
        );

        setFinishError('');

        const success =
          await finishWorkout();

        if (!success) {
          setFinishError(
            '운동 기록 저장에 실패했습니다. 다시 시도해주세요.',
          );

          setIsFinishing(
            false,
          );

          return;
        }

        router.push(
          '/dashboard',
        );
      },
      [
        finishWorkout,
        isFinishing,
        router,
      ],
    );

  // ─────────────────────────────────────────────
  // Log Set
  // ─────────────────────────────────────────────

  const handleLogSet =
    useCallback(
      (
        weight: number,
        reps: number,
        duration?: number,
      ) => {
        const before =
          useStore.getState()
            .activeWorkout;

        if (!before) {
          return;
        }

        const exerciseIndex =
          before.currentExerciseIndex;

        const setIndex =
          before.currentSetIndex;

        const exercise =
          before.exercises[
            exerciseIndex
          ];

        if (!exercise) {
          return;
        }

        const isLastSet =
          setIndex >=
          exercise.target_sets -
            1;

        const isLastExercise =
          exerciseIndex >=
          before.exercises.length -
            1;

        logSet(
          exerciseIndex,
          setIndex,
          weight,
          reps,
          duration,
        );

        /*
         * 기존 store는 마지막 세트 후
         * 바로 다음 운동으로 이동한다.
         *
         * 여기서 다음 운동 전 휴식을 추가.
         */
        if (
          isLastSet &&
          !isLastExercise &&
          exercise.rest_seconds >
            0
        ) {
          const after =
            useStore.getState()
              .activeWorkout;

          if (
            after &&
            after.phase !==
              'complete'
          ) {
            useStore.setState({
              activeWorkout: {
                ...after,

                phase: 'rest',

                restTimer: {
                  endTimestamp:
                    Date.now() +
                    exercise.rest_seconds *
                      1000,

                  totalSeconds:
                    exercise.rest_seconds,
                },
              },
            });
          }
        }
      },
      [
        logSet,
      ],
    );

  // ─────────────────────────────────────────────
  // Add Set
  // 현재 운동 세션에만 적용
  // ─────────────────────────────────────────────

  const handleAddSet =
    useCallback(() => {
      const state =
        useStore.getState();

      const workout =
        state.activeWorkout;

      if (!workout) {
        return;
      }

      const exerciseIndex =
        workout.currentExerciseIndex;

      const exercises =
        workout.exercises.map(
          (exercise, index) =>
            index ===
            exerciseIndex
              ? {
                  ...exercise,

                  target_sets:
                    exercise.target_sets +
                    1,
                }
              : exercise,
        );

      useStore.setState({
        activeWorkout: {
          ...workout,
          exercises,
        },
      });
    }, []);

  // ─────────────────────────────────────────────
  // Remove Set
  // 완료되지 않은 마지막 세트만 삭제
  // ─────────────────────────────────────────────

  const handleRemoveSet =
    useCallback(() => {
      const state =
        useStore.getState();

      const workout =
        state.activeWorkout;

      if (!workout) {
        return;
      }

      const exerciseIndex =
        workout.currentExerciseIndex;

      const exercise =
        workout.exercises[
          exerciseIndex
        ];

      if (!exercise) {
        return;
      }

      if (
        exercise.target_sets <=
          1 ||
        exercise.target_sets <=
          workout.currentSetIndex +
            1
      ) {
        return;
      }

      const exercises =
        workout.exercises.map(
          (item, index) =>
            index ===
            exerciseIndex
              ? {
                  ...item,

                  target_sets:
                    Math.max(
                      1,
                      item.target_sets -
                        1,
                    ),
                }
              : item,
        );

      useStore.setState({
        activeWorkout: {
          ...workout,
          exercises,
        },
      });
    }, []);

  // ─────────────────────────────────────────────
  // Adjust Rest
  // ─────────────────────────────────────────────

  const handleAdjustRest =
    useCallback(
      (
        seconds: number,
      ) => {
        const state =
          useStore.getState();

        const workout =
          state.activeWorkout;

        const timer =
          workout?.restTimer;

        if (
          !workout ||
          !timer
        ) {
          return;
        }

        const currentRemaining =
          Math.max(
            0,
            Math.ceil(
              (
                timer.endTimestamp -
                Date.now()
              ) /
                1000,
            ),
          );

        const nextRemaining =
          Math.max(
            0,
            currentRemaining +
              seconds,
          );

        if (
          nextRemaining <=
          0
        ) {
          clearRestTimer();

          return;
        }

        const elapsed =
          Math.max(
            0,
            timer.totalSeconds -
              currentRemaining,
          );

        const nextTotal =
          Math.max(
            1,
            elapsed +
              nextRemaining,
          );

        useStore.setState({
          activeWorkout: {
            ...workout,

            restTimer: {
              endTimestamp:
                Date.now() +
                nextRemaining *
                  1000,

              totalSeconds:
                nextTotal,
            },
          },
        });
      },
      [
        clearRestTimer,
      ],
    );

  // ─────────────────────────────────────────────
  // Basic Guard
  // ─────────────────────────────────────────────

  if (
    !user ||
    !routine
  ) {
    return null;
  }

  if (
    !activeWorkout ||
    activeWorkout.routineId !==
      routineId
  ) {
    return (
      <StartScreen
        routineName={
          routine.name
        }
        exercises={[
          ...routine.items,
        ].sort(
          (a, b) =>
            a.order -
            b.order,
        )}
        onStart={
          handleStart
        }
        onCancel={() =>
          router.push(
            '/routines',
          )
        }
      />
    );
  }

  // ─────────────────────────────────────────────
  // Complete
  // ─────────────────────────────────────────────

  if (
    activeWorkout.phase ===
    'complete'
  ) {
    return (
      <CompletionScreen
        routineName={
          activeWorkout.routineName
        }
        startedAt={
          activeWorkout.startedAt
        }
        completedSets={
          activeWorkout.completedSets
        }
        onFinish={
          handleFinish
        }
        isSaving={
          isFinishing
        }
        saveError={
          finishError
        }
      />
    );
  }

  // ─────────────────────────────────────────────
  // Current Exercise
  // ─────────────────────────────────────────────

  const currentExercise =
    activeWorkout.exercises[
      activeWorkout.currentExerciseIndex
    ];

  if (!currentExercise) {
    return null;
  }

  const recordType:
    RecordType =
      currentExercise.record_type ??
      'weight_reps';

  const completedForCurrentExercise =
    activeWorkout.completedSets.filter(
      (set) =>
        set.exercise_name ===
        currentExercise.exercise_name,
    );

  // 최근 동일 운동 최대 3회
  const previousSessions:
    PreviousSession[] =
      workoutLogs
        .filter(
          (log) =>
            log.user_id ===
              user.id &&
            log.id !==
              activeWorkout.workoutLogId,
        )
        .map((log) => ({
          id: log.id,

          date: log.date,

          startedAt:
            log.started_at,

          sets: log.sets.filter(
            (set) =>
              set.exercise_name ===
              currentExercise.exercise_name,
          ),
        }))
        .filter(
          (session) =>
            session.sets.length >
            0,
        )
        .sort(
          (a, b) =>
            new Date(
              b.startedAt,
            ).getTime() -
            new Date(
              a.startedAt,
            ).getTime(),
        )
        .slice(0, 3);

  const nextExercise =
    activeWorkout.exercises[
      activeWorkout.currentExerciseIndex +
        1
    ];

  return (
    <ExerciseScreen
      exerciseName={
        currentExercise.exercise_name
      }
      exerciseIndex={
        activeWorkout.currentExerciseIndex
      }
      totalExercises={
        activeWorkout.exercises.length
      }
      currentSet={
        activeWorkout.currentSetIndex
      }
      targetSets={
        currentExercise.target_sets
      }
      targetReps={
        currentExercise.target_reps
      }
      restSeconds={
        currentExercise.rest_seconds
      }
      recordType={
        recordType
      }
      completedSets={
        completedForCurrentExercise
      }
      previousSessions={
        previousSessions
      }
      elapsedSec={
        elapsedSec
      }
      isWakeLocked={
        isWakeLocked
      }
      restTimer={
        activeWorkout.restTimer
      }
      nextExerciseName={
        nextExercise?.exercise_name ??
        null
      }
      onLogSet={
        handleLogSet
      }
      onCancel={
        handleCancel
      }
      onAddSet={
        handleAddSet
      }
      onRemoveSet={
        handleRemoveSet
      }
      onSkipRest={
        clearRestTimer
      }
      onAdjustRest={
        handleAdjustRest
      }
    />
  );
}

// ─────────────────────────────────────────────
// Set Table Header
// ─────────────────────────────────────────────

function SetTableHeader({
  recordType,
}: {
  recordType: RecordType;
}) {
  if (
    recordType ===
    'weight_reps'
  ) {
    return (
      <div className="grid grid-cols-[48px_1fr_1fr_52px] gap-2 px-1.5 text-center text-[11px] font-semibold text-zinc-600">
        <span>세트</span>
        <span>KG</span>
        <span>횟수</span>
        <span>완료</span>
      </div>
    );
  }

  if (
    recordType ===
    'reps_only'
  ) {
    return (
      <div className="grid grid-cols-[56px_1fr_64px] gap-3 px-1.5 text-center text-[11px] font-semibold text-zinc-600">
        <span>세트</span>
        <span>횟수</span>
        <span>완료</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[56px_1fr_64px] gap-3 px-1.5 text-center text-[11px] font-semibold text-zinc-600">
      <span>세트</span>
      <span>남은 시간</span>
      <span>완료</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Set Number
// ─────────────────────────────────────────────

function SetNumberBox({
  number,
  completed,
  current,
}: {
  number: number;
  completed: boolean;
  current: boolean;
}) {
  return (
    <div
      className={`flex h-14 items-center justify-center rounded-xl text-lg font-bold ${
        completed
          ? 'bg-emerald-500/15 text-emerald-400'
          : current
            ? 'bg-blue-500/15 text-blue-400'
            : 'bg-zinc-900 text-zinc-600'
      }`}
    >
      {number}
    </div>
  );
}

// ─────────────────────────────────────────────
// Number Cell
// ─────────────────────────────────────────────

function NumberCell({
  value,
  disabled,
  decimal,

  onChange,

  onMinus,
  onPlus,
}: {
  value: string;
  disabled: boolean;
  decimal?: boolean;

  onChange: (
    value: string,
  ) => void;

  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        disabled={disabled}
        inputMode={
          decimal
            ? 'decimal'
            : 'numeric'
        }
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        className={`h-14 w-full rounded-xl border px-8 text-center text-lg font-bold transition-colors focus:outline-none ${
          disabled
            ? 'border-emerald-500/10 bg-emerald-500/[0.06] text-emerald-300'
            : 'border-zinc-800 bg-zinc-900 text-white focus:border-blue-500'
        }`}
      />

      {!disabled && (
        <>
          <button
            type="button"
            onClick={
              onMinus
            }
            className="absolute left-1 top-1/2 flex h-8 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-600 transition-colors active:bg-zinc-800 active:text-zinc-300"
            aria-label="감소"
          >
            −
          </button>

          <button
            type="button"
            onClick={
              onPlus
            }
            className="absolute right-1 top-1/2 flex h-8 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-600 transition-colors active:bg-zinc-800 active:text-zinc-300"
            aria-label="증가"
          >
            +
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Complete Cell
// ─────────────────────────────────────────────

function CompleteCell({
  completed,
  enabled,
  future,
  onClick,
}: {
  completed: boolean;
  enabled: boolean;
  future: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={
        !enabled
      }
      onClick={
        onClick
      }
      className={`flex h-14 items-center justify-center rounded-xl border transition-colors ${
        completed
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : enabled
            ? 'border-blue-500/30 bg-blue-500/10 text-blue-400 active:bg-blue-500/20'
            : future
              ? 'border-zinc-800 bg-zinc-900 text-zinc-800'
              : 'border-zinc-800 bg-zinc-900 text-zinc-700'
      }`}
    >
      {completed ? (
        <Check
          size={20}
          strokeWidth={3}
        />
      ) : (
        <div className="h-5 w-5 rounded-md border-2 border-current" />
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Previous Session
// ─────────────────────────────────────────────

function PreviousSessionCard({
  session,
  recordType,
}: {
  session: PreviousSession;
  recordType: RecordType;
}) {
  const sortedSets =
    [...session.sets].sort(
      (a, b) =>
        a.set_number -
        b.set_number,
    );

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-blue-500" />

        <p className="text-sm font-semibold">
          {formatHistoryDate(
            session.date,
          )}
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {sortedSets.map(
          (set) => (
            <div
              key={set.id}
              className="grid grid-cols-[32px_1fr] items-center text-sm"
            >
              <span className="font-medium text-zinc-600">
                {set.set_number}
              </span>

              <span className="font-medium text-zinc-300">
                {setLabel(
                  set,
                  set.record_type ??
                    recordType,
                )}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Set Label
// ─────────────────────────────────────────────

function setLabel(
  set: SetLog,
  recordType: RecordType,
) {
  if (
    recordType === 'time'
  ) {
    return formatDuration(
      set.duration_seconds ?? 0,
    );
  }

  if (
    recordType ===
    'reps_only'
  ) {
    return `${set.reps}회`;
  }

  return `${set.weight_kg}kg × ${set.reps}회`;
}

// ─────────────────────────────────────────────
// History Date
// ─────────────────────────────────────────────

function formatHistoryDate(
  value: string,
) {
  const date =
    new Date(
      `${value}T00:00:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'ko-KR',
    {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    },
  ).format(date);
}

// ─────────────────────────────────────────────
// Summary Card
// ─────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: ComponentType<{
    size?: number;
    className?: string;
  }>;

  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <Icon
        size={17}
        className="text-blue-400"
      />

      <p className="mt-4 text-xl font-bold">
        {value}

        <span className="ml-1 text-xs font-medium text-zinc-500">
          {unit}
        </span>
      </p>

      <p className="mt-1 text-xs text-zinc-600">
        {label}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Completion Metric
// ─────────────────────────────────────────────

function CompletionMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-2 py-4 text-center">
      <p className="truncate text-base font-bold">
        {value}
      </p>

      <p className="mt-1 text-[10px] text-zinc-600">
        {label}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Record Badge
// ─────────────────────────────────────────────

function RecordBadge({
  type,
}: {
  type: RecordType;
}) {
  const label =
    type === 'weight_reps'
      ? '무게 · 횟수'
      : type ===
          'reps_only'
        ? '횟수'
        : '시간';

  return (
    <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-500">
      {label}
    </span>
  );
}