'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useWakeLock } from '@/hooks/useWakeLock';
import {
  ChevronLeft, X, Check, SkipForward,
  Monitor, Zap,
} from 'lucide-react';
import {
  formatDuration, playBeep, sendNotification,
  requestNotificationPermission, calcTotalVolume, elapsedSeconds,
} from '@/lib/utils';
import type { SetLog, RecordType } from '@/lib/types';

// ─── Start Screen ──────────────────────────────────────────────────────────

function StartScreen({
  routineName,
  exercises,
  hasActiveWorkout,
  onStart,
  onResume,
  onCancel,
}: {
  routineName: string;
  exercises: { exercise_name: string; target_sets: number; target_reps: number; rest_seconds: number; record_type: RecordType }[];
  hasActiveWorkout: boolean;
  onStart: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col px-4 pt-12 pb-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onCancel} className="text-zinc-400 hover:text-white p-1 -ml-1">
          <ChevronLeft size={24} />
        </button>
      </div>

      <div className="flex-1">
        <div className="mb-1 text-sm text-zinc-400">오늘의 루틴</div>
        <h1 className="text-3xl font-bold mb-6">{routineName}</h1>

        <div className="space-y-2 mb-8">
          {exercises.map((ex, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-zinc-400 flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{ex.exercise_name}</p>
                <p className="text-xs text-zinc-400">
                  {ex.target_sets}세트 ×{' '}
                  {ex.record_type === 'time'
                    ? `${formatDuration(ex.target_reps)}`
                    : `${ex.target_reps}회`}{' '}
                  · 휴식 {ex.rest_seconds}초
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {hasActiveWorkout && (
          <button
            onClick={onResume}
            className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-4 rounded-2xl text-lg transition-colors"
          >
            이어서 하기
          </button>
        )}
        <button
          onClick={onStart}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2"
        >
          <Zap size={20} fill="white" />
          {hasActiveWorkout ? '새로 시작' : '운동 시작'}
        </button>
      </div>
    </div>
  );
}

// ─── Rest Timer Screen ─────────────────────────────────────────────────────

function RestScreen({
  endTimestamp,
  totalSeconds,
  onSkip,
}: {
  endTimestamp: number;
  totalSeconds: number;
  onSkip: () => void;
}) {
  const [, setTick] = useState(0);
  const hasNotified = useRef(false);

  useEffect(() => {
    hasNotified.current = false;
    const interval = setInterval(() => {
      const remaining = endTimestamp - Date.now();
      setTick((n) => n + 1);
      if (remaining <= 0 && !hasNotified.current) {
        hasNotified.current = true;
        clearInterval(interval);
        playBeep();
        sendNotification('휴식 완료!', '다음 세트를 시작하세요');
        setTimeout(onSkip, 800);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [endTimestamp, onSkip]);

  const remainingMs = Math.max(0, endTimestamp - Date.now());
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = 1 - remainingMs / (totalSeconds * 1000);

  const circumference = 2 * Math.PI * 54;
  const strokeOffset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-950">
      <p className="text-zinc-400 text-sm mb-8 uppercase tracking-widest">휴식 중</p>

      {/* Circular progress */}
      <div className="relative w-40 h-40 mb-8">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#27272a" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={remainingSec <= 5 ? '#f97316' : '#3b82f6'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            className="transition-all duration-200"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${remainingSec <= 5 ? 'text-orange-400' : 'text-white'}`}>
            {formatDuration(remainingSec)}
          </span>
        </div>
      </div>

      <button
        onClick={onSkip}
        className="flex items-center gap-2 text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-6 py-3 rounded-2xl transition-colors"
      >
        <SkipForward size={16} />
        건너뛰기
      </button>
    </div>
  );
}

// ─── Set display helper ────────────────────────────────────────────────────

function setLabel(s: SetLog, recordType: RecordType): string {
  if (recordType === 'time') return formatDuration(s.duration_seconds ?? 0);
  if (recordType === 'reps_only') return `${s.reps}회`;
  return `${s.weight_kg}kg × ${s.reps}`;
}

// ─── Exercise Screen ───────────────────────────────────────────────────────

function ExerciseScreen({
  exerciseName,
  exerciseIndex,
  totalExercises,
  currentSet,
  targetSets,
  targetReps,
  recordType,
  completedSets,
  previousSets,
  elapsedSec,
  isWakeLocked,
  onLogSet,
  onCancel,
}: {
  exerciseName: string;
  exerciseIndex: number;
  totalExercises: number;
  currentSet: number;
  targetSets: number;
  targetReps: number;
  recordType: RecordType;
  completedSets: SetLog[];
  previousSets: SetLog[] | null;
  elapsedSec: number;
  isWakeLocked: boolean;
  onLogSet: (weight: number, reps: number, duration?: number) => void;
  onCancel: () => void;
}) {
  const lastCompleted = completedSets[completedSets.length - 1];
  const prevDefaultWeight = lastCompleted
    ? String(lastCompleted.weight_kg)
    : previousSets?.[Math.min(currentSet, previousSets.length - 1)]
    ? String(previousSets[Math.min(currentSet, previousSets.length - 1)].weight_kg)
    : '';

  const [weight, setWeight] = useState(prevDefaultWeight);
  const [reps, setReps] = useState(String(targetReps));
  const [duration, setDuration] = useState(targetReps); // seconds for time mode
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Reset inputs when exercise or set changes
  useEffect(() => {
    setWeight(prevDefaultWeight);
    setReps(String(targetReps));
    setDuration(targetReps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseName, currentSet]);

  const handleLog = () => {
    if (recordType === 'time') {
      onLogSet(0, 0, duration);
    } else if (recordType === 'reps_only') {
      onLogSet(0, parseInt(reps) || 0);
    } else {
      onLogSet(parseFloat(weight) || 0, parseInt(reps) || 0);
    }
  };

  const adjustWeight = (delta: number) => {
    const current = parseFloat(weight) || 0;
    const next = Math.max(0, Math.round((current + delta) * 4) / 4);
    setWeight(String(next % 1 === 0 ? next : next.toFixed(1)));
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="px-4 pt-10 pb-3 flex items-center justify-between">
        <button
          onClick={() => setConfirmCancel(true)}
          className="text-zinc-400 hover:text-white p-1 -ml-1"
        >
          <X size={22} />
        </button>
        <div className="flex items-center gap-2">
          {isWakeLocked && (
            <div className="flex items-center gap-1 text-emerald-400/70 text-xs">
              <Monitor size={12} />
              <span>화면 유지</span>
            </div>
          )}
          <span className="text-zinc-400 text-sm tabular-nums">{formatDuration(elapsedSec)}</span>
        </div>
      </div>

      {/* Exercise progress */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 mb-3">
          {Array.from({ length: totalExercises }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < exerciseIndex
                  ? 'bg-emerald-500'
                  : i === exerciseIndex
                  ? 'bg-blue-500'
                  : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-zinc-400">
          {exerciseIndex + 1} / {totalExercises} 번째 운동
        </p>
      </div>

      {/* Exercise name + set dots */}
      <div className="px-4 mb-4">
        <h2 className="text-2xl font-bold">{exerciseName}</h2>
        <div className="flex gap-2 mt-1">
          {Array.from({ length: targetSets }).map((_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < currentSet
                  ? 'bg-emerald-500 text-white'
                  : i === currentSet
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {i < currentSet ? <Check size={12} /> : i + 1}
            </div>
          ))}
          <span className="text-sm text-zinc-400 self-center ml-1">
            세트 {currentSet + 1} / {targetSets}
          </span>
        </div>
      </div>

      {/* Previous best */}
      {previousSets && previousSets.length > 0 && (
        <div className="mx-4 mb-4 bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1.5">지난 기록</p>
          <div className="flex flex-wrap gap-2">
            {previousSets.map((s) => (
              <span key={s.id} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-lg">
                {s.set_number}세트 {setLabel(s, s.record_type ?? recordType)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Completed sets for this exercise */}
      {completedSets.length > 0 && (
        <div className="mx-4 mb-4">
          <p className="text-xs text-zinc-500 mb-2">완료한 세트</p>
          <div className="flex flex-wrap gap-2">
            {completedSets.map((s) => (
              <div key={s.id} className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl px-3 py-2 flex items-center gap-1.5">
                <Check size={12} className="text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">
                  {setLabel(s, recordType)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* ── Weight input (weight_reps only) ── */}
      {recordType === 'weight_reps' && (
        <div className="px-4 mb-4">
          <p className="text-xs text-zinc-400 mb-2 text-center">무게 (kg)</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => adjustWeight(-2.5)}
              className="w-14 h-14 bg-zinc-900 rounded-2xl text-xl font-bold text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors flex-shrink-0"
            >
              −
            </button>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-2xl py-4 text-center text-3xl font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="0"
            />
            <button
              onClick={() => adjustWeight(2.5)}
              className="w-14 h-14 bg-zinc-900 rounded-2xl text-xl font-bold text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors flex-shrink-0"
            >
              +
            </button>
          </div>
          <div className="flex justify-center gap-2 mt-2">
            {[20, 40, 60, 80, 100].map((w) => (
              <button
                key={w}
                onClick={() => setWeight(String(w))}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 bg-zinc-900 rounded-lg transition-colors"
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Reps input (weight_reps | reps_only) ── */}
      {(recordType === 'weight_reps' || recordType === 'reps_only') && (
        <div className="px-4 mb-6">
          <p className="text-xs text-zinc-400 mb-2 text-center">횟수</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setReps(String(Math.max(1, parseInt(reps) - 1 || 0)))}
              className="w-14 h-14 bg-zinc-900 rounded-2xl text-xl font-bold text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors flex-shrink-0"
            >
              −
            </button>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              inputMode="numeric"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-2xl py-4 text-center text-3xl font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="0"
            />
            <button
              onClick={() => setReps(String((parseInt(reps) || 0) + 1))}
              className="w-14 h-14 bg-zinc-900 rounded-2xl text-xl font-bold text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors flex-shrink-0"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* ── Duration input (time only) ── */}
      {recordType === 'time' && (
        <div className="px-4 mb-6">
          <p className="text-xs text-zinc-400 mb-2 text-center">시간</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDuration((d) => Math.max(5, d - 15))}
              className="w-14 h-14 bg-zinc-900 rounded-2xl text-sm font-bold text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors flex-shrink-0"
            >
              −15s
            </button>
            <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-2xl py-4 text-center text-3xl font-bold text-white tabular-nums">
              {formatDuration(duration)}
            </div>
            <button
              onClick={() => setDuration((d) => d + 15)}
              className="w-14 h-14 bg-zinc-900 rounded-2xl text-sm font-bold text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors flex-shrink-0"
            >
              +15s
            </button>
          </div>
          <div className="flex justify-center gap-2 mt-2">
            {[30, 60, 90, 120, 180].map((s) => (
              <button
                key={s}
                onClick={() => setDuration(s)}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 bg-zinc-900 rounded-lg transition-colors"
              >
                {formatDuration(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Complete set button */}
      <div className="px-4 pb-10">
        <button
          onClick={handleLog}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-5 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2"
        >
          <Check size={22} strokeWidth={3} />
          세트 완료
        </button>
      </div>

      {/* Cancel confirm overlay */}
      {confirmCancel && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50">
          <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl p-6">
            <h3 className="text-lg font-bold mb-1">운동을 종료할까요?</h3>
            <p className="text-zinc-400 text-sm mb-6">현재까지의 기록은 저장되지 않습니다.</p>
            <div className="space-y-2">
              <button
                onClick={onCancel}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3.5 rounded-xl transition-colors"
              >
                종료하기
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3.5 rounded-xl transition-colors"
              >
                계속하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Completion Screen ─────────────────────────────────────────────────────

function CompletionScreen({
  routineName,
  startedAt,
  completedSets,
  onFinish,
}: {
  routineName: string;
  startedAt: string;
  completedSets: SetLog[];
  onFinish: () => void;
}) {
  const durationSec = elapsedSeconds(startedAt);
  const totalVolume = calcTotalVolume(completedSets);

  const exerciseGroups = completedSets.reduce<Record<string, SetLog[]>>((acc, s) => {
    (acc[s.exercise_name] = acc[s.exercise_name] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col px-4 pt-12 pb-10">
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-1">운동 완료!</h1>
        <p className="text-zinc-400">{routineName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: '운동 시간', value: formatDuration(durationSec) },
          { label: '총 세트', value: `${completedSets.length}` },
          { label: '총 볼륨', value: totalVolume > 0 ? `${totalVolume.toLocaleString()}kg` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 rounded-2xl p-3 text-center">
            <p className="text-lg font-bold">{value}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Per-exercise summary */}
      <div className="space-y-3 mb-8">
        {Object.entries(exerciseGroups).map(([name, sets]) => (
          <div key={name} className="bg-zinc-900 rounded-2xl px-4 py-3">
            <p className="font-semibold text-sm mb-2">{name}</p>
            <div className="flex flex-wrap gap-1.5">
              {sets.map((s) => (
                <span key={s.id} className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-lg">
                  {setLabel(s, s.record_type ?? 'weight_reps')}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <button
          onClick={onFinish}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors"
        >
          기록 저장
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function WorkoutPage() {
  const router = useRouter();
  const params = useParams();
  const routineId = params.id as string;

  const { currentUser, routines, activeWorkout, workoutLogs, startWorkout, logSet, clearRestTimer, finishWorkout, cancelWorkout } = useStore();

  const user = currentUser();
  const routine = routines.find((r) => r.id === routineId);

  const isWorkoutInProgress =
    activeWorkout?.routineId === routineId && activeWorkout.phase !== 'complete';

  const isWakeLocked = useWakeLock(isWorkoutInProgress);

  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!user) { router.replace('/login'); return; }
    if (!routine) { router.replace('/routines'); return; }
  }, [user, routine, router]);

  useEffect(() => {
    if (!activeWorkout?.startedAt) return;
    setElapsedSec(elapsedSeconds(activeWorkout.startedAt));
    const interval = setInterval(() => {
      setElapsedSec(elapsedSeconds(activeWorkout.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout?.startedAt]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const handleStart = useCallback(() => {
    if (activeWorkout?.routineId === routineId) cancelWorkout();
    startWorkout(routineId);
  }, [activeWorkout, routineId, cancelWorkout, startWorkout]);

  const handleResume = useCallback(() => {
    // activeWorkout already set — just let the page render it
  }, []);

  const handleFinish = useCallback(() => {
    finishWorkout();
    router.push('/dashboard');
  }, [finishWorkout, router]);

  const handleCancel = useCallback(() => {
    cancelWorkout();
    router.push('/routines');
  }, [cancelWorkout, router]);

  const handleLogSet = useCallback(
    (weight: number, reps: number, duration?: number) => {
      if (!activeWorkout) return;
      logSet(activeWorkout.currentExerciseIndex, activeWorkout.currentSetIndex, weight, reps, duration);
    },
    [activeWorkout, logSet],
  );

  if (!user || !routine) return null;

  const hasActiveWorkout = !!activeWorkout && activeWorkout.routineId === routineId;

  // ── No active workout: show start screen ──
  if (!hasActiveWorkout || (hasActiveWorkout && !activeWorkout)) {
    return (
      <StartScreen
        routineName={routine.name}
        exercises={[...routine.items].sort((a, b) => a.order - b.order)}
        hasActiveWorkout={false}
        onStart={handleStart}
        onResume={handleResume}
        onCancel={() => router.push('/routines')}
      />
    );
  }

  // ── Completion screen ──
  if (activeWorkout.phase === 'complete') {
    return (
      <CompletionScreen
        routineName={activeWorkout.routineName}
        startedAt={activeWorkout.startedAt}
        completedSets={activeWorkout.completedSets}
        onFinish={handleFinish}
      />
    );
  }

  // ── Rest timer screen ──
  if (activeWorkout.phase === 'rest' && activeWorkout.restTimer) {
    return (
      <RestScreen
        endTimestamp={activeWorkout.restTimer.endTimestamp}
        totalSeconds={activeWorkout.restTimer.totalSeconds}
        onSkip={clearRestTimer}
      />
    );
  }

  // ── Exercise input screen ──
  const currentExercise = activeWorkout.exercises[activeWorkout.currentExerciseIndex];
  const recordType: RecordType = currentExercise.record_type ?? 'weight_reps';

  const completedForCurrentExercise = activeWorkout.completedSets.filter(
    (s) => s.exercise_name === currentExercise.exercise_name,
  );

  // Find previous best from last workout that had this exercise
  const previousSets = (() => {
    const myLogs = workoutLogs
      .filter((l) => l.user_id === user.id && l.id !== activeWorkout.workoutLogId)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    for (const log of myLogs) {
      const sets = log.sets.filter((s) => s.exercise_name === currentExercise.exercise_name);
      if (sets.length > 0) return sets;
    }
    return null;
  })();

  return (
    <ExerciseScreen
      exerciseName={currentExercise.exercise_name}
      exerciseIndex={activeWorkout.currentExerciseIndex}
      totalExercises={activeWorkout.exercises.length}
      currentSet={activeWorkout.currentSetIndex}
      targetSets={currentExercise.target_sets}
      targetReps={currentExercise.target_reps}
      recordType={recordType}
      completedSets={completedForCurrentExercise}
      previousSets={previousSets}
      elapsedSec={elapsedSec}
      isWakeLocked={isWakeLocked}
      onLogSet={handleLogSet}
      onCancel={handleCancel}
    />
  );
}
