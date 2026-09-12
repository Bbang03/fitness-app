'use client';

import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Minus,
  Plus,
  Save,
  X,
} from 'lucide-react';

import { useStore } from '@/lib/store';

import type {
  RecordType,
  RoutineItem,
} from '@/lib/types';

type DraftItem =
  Omit<RoutineItem, 'id'>;

const MULTI_EXERCISE_SELECTION_KEY =
  'chagok-routine-multi-exercise-selection-v1';

type MultiExerciseSelection = {
  targetIndex: number;

  exercises: Array<{
    name: string;
    record_type: RecordType;
  }>;
};

const DEFAULT_ITEM = (
  order: number,
): DraftItem => ({
  order,

  exercise_name: '',

  target_sets: 3,

  target_reps: 10,

  target_weight_kg: 0,

  rest_seconds: 90,

  record_type:
    'weight_reps',

  superset_group: null,
});

function createExerciseItem(
  order: number,
  exerciseName: string,
  recordType: RecordType,
): DraftItem {
  const base =
    DEFAULT_ITEM(order);

  return {
    ...base,

    exercise_name:
      exerciseName,

    record_type:
      recordType,

    // 시간 기반 운동은 기본 60초,
    // 나머지는 기본 10회
    target_reps:
      recordType ===
      'time'
        ? 60
        : 10,

    // 루틴 목표 무게는
    // weight_reps에서만 사용
    target_weight_kg: 0,

    // 시간/맨몸 운동은 기본 휴식을
    // 조금 더 짧게 시작
    rest_seconds:
      recordType ===
      'weight_reps'
        ? 90
        : 60,
  };
}

function normalizeDraftItem(
  item: DraftItem,
  index: number,
): DraftItem {
  const recordType =
    item.record_type ??
    'weight_reps';

  return {
    ...item,

    order: index,

    record_type:
      recordType,

    target_sets:
      Number.isFinite(
        Number(
          item.target_sets,
        ),
      )
        ? Math.max(
            1,
            Number(
              item.target_sets,
            ),
          )
        : 3,

    target_reps:
      Number.isFinite(
        Number(
          item.target_reps,
        ),
      )
        ? Math.max(
            1,
            Number(
              item.target_reps,
            ),
          )
        : recordType ===
            'time'
          ? 60
          : 10,

    target_weight_kg:
      recordType ===
      'weight_reps' &&
      Number.isFinite(
        Number(
          item.target_weight_kg ??
            0,
        ),
      )
        ? Math.max(
            0,
            Number(
              item.target_weight_kg ??
                0,
            ),
          )
        : 0,

    rest_seconds:
      Number.isFinite(
        Number(
          item.rest_seconds,
        ),
      )
        ? Math.max(
            0,
            Number(
              item.rest_seconds,
            ),
          )
        : 90,

    superset_group:
      item.superset_group ??
      null,
  };
}

function getNextRoutineName(
  routines: Array<{
    user_id: string;
    name: string;
  }>,
  userId?: string,
) {
  if (!userId) {
    return '루틴000';
  }

  let maxNumber = -1;

  routines.forEach(
    (routine) => {
      if (
        routine.user_id !==
        userId
      ) {
        return;
      }

      const match =
        /^루틴(\d+)$/.exec(
          routine.name.trim(),
        );

      if (!match) {
        return;
      }

      const number =
        Number(match[1]);

      if (
        Number.isFinite(
          number,
        )
      ) {
        maxNumber =
          Math.max(
            maxNumber,
            number,
          );
      }
    },
  );

  return `루틴${String(
    maxNumber + 1,
  ).padStart(3, '0')}`;
}

function recordTypeLabel(
  type: RecordType,
) {
  if (
    type ===
    'weight_reps'
  ) {
    return '무게 + 횟수';
  }

  if (
    type ===
    'reps_only'
  ) {
    return '횟수';
  }

  return '시간';
}

function formatWeight(
  value: number,
) {
  return Number.isInteger(
    value,
  )
    ? String(value)
    : value.toFixed(1);
}

export default function NewRoutinePage() {
  const router =
    useRouter();

  const {
    currentUser,

    routines,
    addRoutine,

    pendingExercise,
    setPendingExercise,

    routineDraft,
    setRoutineDraft,
    clearRoutineDraft,
  } = useStore();

  const user =
    currentUser();

  const [
    name,
    setName,
  ] =
    useState(
      () =>
        routineDraft?.name
          ?.trim()
          ? routineDraft.name
          : getNextRoutineName(
              routines,
              user?.id,
            ),
    );

  const [
    items,
    setItems,
  ] =
    useState<DraftItem[]>(
      () =>
        (
          routineDraft?.items ??
          []
        ).map(
          normalizeDraftItem,
        ),
    );

  const [
    detailIndex,
    setDetailIndex,
  ] =
    useState<
      number | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState('');

  const [
    isSaving,
    setIsSaving,
  ] =
    useState(false);

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
  // Draft
  // ─────────────────────────────────────────────

  useEffect(() => {
    setRoutineDraft({
      name,
      items,
    });
  }, [
    name,
    items,
    setRoutineDraft,
  ]);

  // ─────────────────────────────────────────────
  // Single exercise picker result
  // Custom exercise 등 단일 선택 호환용
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (
      !pendingExercise
    ) {
      return;
    }

    const {
      name:
        exerciseName,

      record_type:
        recordType,

      targetIndex,
    } =
      pendingExercise;

    setItems(
      (previous) => {
        const safeIndex =
          Math.min(
            Math.max(
              targetIndex,
              0,
            ),
            previous.length,
          );

        const newItem =
          createExerciseItem(
            safeIndex,
            exerciseName,
            recordType,
          );

        if (
          safeIndex <
          previous.length
        ) {
          return previous
            .map(
              (
                item,
                index,
              ) =>
                index ===
                safeIndex
                  ? newItem
                  : item,
            )
            .map(
              normalizeDraftItem,
            );
        }

        return [
          ...previous,
          newItem,
        ].map(
          normalizeDraftItem,
        );
      },
    );

    setError('');

    setPendingExercise(
      null,
    );
  }, [
    pendingExercise,
    setPendingExercise,
  ]);

  // ─────────────────────────────────────────────
  // Multi exercise picker result
  // ─────────────────────────────────────────────

  useEffect(() => {
    const raw =
      window.sessionStorage.getItem(
        MULTI_EXERCISE_SELECTION_KEY,
      );

    if (!raw) {
      return;
    }

    window.sessionStorage.removeItem(
      MULTI_EXERCISE_SELECTION_KEY,
    );

    try {
      const selection =
        JSON.parse(
          raw,
        ) as MultiExerciseSelection;

      if (
        !Array.isArray(
          selection.exercises,
        ) ||
        selection.exercises.length ===
          0
      ) {
        return;
      }

      setItems(
        (previous) => {
          const safeIndex =
            Math.min(
              Math.max(
                Number(
                  selection.targetIndex,
                ) || 0,
                0,
              ),
              previous.length,
            );

          const selectedItems =
            selection.exercises.map(
              (
                exercise,
                selectedIndex,
              ) =>
                createExerciseItem(
                  safeIndex +
                    selectedIndex,
                  exercise.name,
                  exercise.record_type,
                ),
            );

          return [
            ...previous.slice(
              0,
              safeIndex,
            ),

            ...selectedItems,

            ...previous.slice(
              safeIndex,
            ),
          ].map(
            normalizeDraftItem,
          );
        },
      );

      setError('');
    } catch (loadError) {
      console.error(
        '운동 선택 결과를 불러오지 못했습니다.',
        loadError,
      );
    }
  }, []);

  if (!user) {
    return null;
  }

  // ─────────────────────────────────────────────
  // Item handlers
  // ─────────────────────────────────────────────

  const removeItem =
    (
      index: number,
    ) => {
      setItems(
        (previous) =>
          previous
            .filter(
              (
                _,
                itemIndex,
              ) =>
                itemIndex !==
                index,
            )
            .map(
              normalizeDraftItem,
            ),
      );

      if (
        detailIndex ===
        index
      ) {
        setDetailIndex(
          null,
        );
      } else if (
        detailIndex !==
          null &&
        detailIndex >
          index
      ) {
        setDetailIndex(
          detailIndex -
            1,
        );
      }

      setError('');
    };

  const updateItem = <
    K extends keyof DraftItem,
  >(
    index: number,
    field: K,
    value: DraftItem[K],
  ) => {
    setItems(
      (previous) =>
        previous.map(
          (
            item,
            itemIndex,
          ) => {
            if (
              itemIndex !==
              index
            ) {
              return item;
            }

            const next = {
              ...item,
              [field]:
                value,
            };

            // 무게는 weight_reps 운동에서만 유지
            if (
              next.record_type !==
              'weight_reps'
            ) {
              next.target_weight_kg =
                0;
            }

            return next;
          },
        ),
    );

    setError('');
  };

  // ─────────────────────────────────────────────
  // Save
  // ─────────────────────────────────────────────

  const handleSubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (isSaving) {
        return;
      }

      if (
        !name.trim()
      ) {
        setError(
          '루틴 이름을 입력해주세요.',
        );

        return;
      }

      if (
        items.length ===
        0
      ) {
        setError(
          '운동을 하나 이상 추가해주세요.',
        );

        return;
      }

      if (
        items.some(
          (item) =>
            !item.exercise_name.trim(),
        )
      ) {
        setError(
          '모든 운동을 선택해주세요.',
        );

        return;
      }

      setError('');
      setIsSaving(true);

      try {
        const normalizedItems =
          items.map(
            normalizeDraftItem,
          );

        const id =
          await addRoutine(
            name.trim(),
            normalizedItems,
          );

        if (!id) {
          setError(
            '루틴 저장에 실패했습니다. 다시 시도해주세요.',
          );

          return;
        }

        clearRoutineDraft();

        router.push(
          '/routines',
        );
      } finally {
        setIsSaving(
          false,
        );
      }
    };

  const totalSets =
    items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.target_sets,
      0,
    );

  const detailItem =
    detailIndex !==
      null
      ? items[
          detailIndex
        ] ??
        null
      : null;

  return (
    <>
      <div className="min-h-screen pb-28">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-zinc-950/90 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 pb-4 pt-10">
            <button
              type="button"
              onClick={() => {
                clearRoutineDraft();
                router.back();
              }}
              disabled={
                isSaving
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-40"
              aria-label="뒤로 가기"
            >
              <ChevronLeft
                size={22}
              />
            </button>

            <div className="flex-1">
              <p className="text-xs text-zinc-500">
                운동 루틴
              </p>

              <h1 className="text-lg font-bold">
                새 루틴 만들기
              </h1>
            </div>

            <div className="text-right">
              <p className="text-xs font-semibold text-zinc-300">
                {
                  items.length
                }{' '}
                운동
              </p>

              <p className="text-[10px] text-zinc-600">
                {
                  totalSets
                }{' '}
                세트
              </p>
            </div>
          </div>
        </header>

        <form
          id="new-routine-form"
          onSubmit={
            handleSubmit
          }
          className="px-5 pt-6"
        >
          {/* Routine name */}
          <section>
            <label className="mb-2 block text-xs font-semibold text-zinc-400">
              루틴 이름
            </label>

            <input
              type="text"
              value={name}
              onChange={(
                event,
              ) => {
                setName(
                  event.target
                    .value,
                );

                setError('');
              }}
              disabled={
                isSaving
              }
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 text-white placeholder-zinc-600 transition-colors focus:border-blue-500 focus:outline-none disabled:opacity-50"
              placeholder="루틴 이름"
            />
          </section>

          {/* Exercises */}
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">
                  운동 구성
                </h2>

                <p className="mt-1 text-xs text-zinc-600">
                  운동을 눌러 목표를 설정하세요.
                </p>
              </div>

              <span className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs text-zinc-500">
                {
                  items.length
                }
                개
              </span>
            </div>

            <div className="space-y-2">
              {items.length ===
                0 && (
                <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/30 px-5 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                    <Dumbbell
                      size={21}
                      className="text-blue-400"
                    />
                  </div>

                  <p className="mt-4 text-sm font-semibold text-zinc-300">
                    아직 운동이 없어요
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                    운동 추가를 눌러 루틴에 넣을 운동을 선택해주세요.
                  </p>
                </div>
              )}

              {items.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={
                      index
                    }
                    className="flex items-center overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/70"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setDetailIndex(
                          index,
                        )
                      }
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-zinc-800/50"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xs font-bold text-blue-400">
                        {
                          index +
                          1
                        }
                      </div>

                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {
                          item.exercise_name
                        }
                      </p>

                      <ChevronRight
                        size={17}
                        className="flex-shrink-0 text-zinc-600"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        removeItem(
                          index,
                        )
                      }
                      disabled={
                        isSaving
                      }
                      className="mr-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                      aria-label={`${item.exercise_name} 삭제`}
                    >
                      <X
                        size={16}
                      />
                    </button>
                  </div>
                ),
              )}
            </div>

            <Link
              href={`/exercises/select?idx=${items.length}&mode=multi`}
              onClick={() => {
                setRoutineDraft({
                  name,
                  items,
                });
              }}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/20 py-4 text-sm font-medium transition-colors ${
                isSaving
                  ? 'pointer-events-none text-zinc-700 opacity-50'
                  : 'text-zinc-500 hover:border-blue-500/40 hover:text-blue-400'
              }`}
            >
              <Plus
                size={17}
              />

              운동 추가
            </Link>
          </section>

          {/* Summary */}
          <section className="mt-7 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Dumbbell
                  size={19}
                  className="text-blue-400"
                />
              </div>

              <div>
                <p className="text-sm font-semibold">
                  루틴 요약
                </p>

                <p className="mt-0.5 text-xs text-zinc-500">
                  {
                    items.length
                  }{' '}
                  가지 운동 · 총{' '}
                  {
                    totalSets
                  }{' '}
                  세트
                </p>
              </div>
            </div>
          </section>

          {error && (
            <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-center text-sm text-red-400">
              {error}
            </p>
          )}
        </form>

        {/* Bottom save */}
        <footer className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-white/[0.06] bg-zinc-950/90 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <button
            form="new-routine-form"
            type="submit"
            disabled={
              isSaving
            }
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-colors ${
              isSaving
                ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {isSaving ? (
              <>
                <Save
                  size={17}
                />

                저장 중...
              </>
            ) : (
              <>
                <Check
                  size={18}
                />

                루틴 저장
              </>
            )}
          </button>
        </footer>
      </div>

      {/* Exercise detail */}
      {detailItem &&
        detailIndex !==
          null && (
          <div className="fixed inset-0 z-[100] overflow-y-auto bg-zinc-950 text-white">
            <div className="mx-auto min-h-screen w-full max-w-md pb-10">
              <header className="sticky top-0 z-10 border-b border-white/[0.05] bg-zinc-950/95 backdrop-blur-xl">
                <div className="flex items-center gap-3 px-4 pb-4 pt-10">
                  <button
                    type="button"
                    onClick={() =>
                      setDetailIndex(
                        null,
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
                    aria-label="상세 설정 닫기"
                  >
                    <ChevronLeft
                      size={23}
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-600">
                      운동 상세 설정
                    </p>

                    <h2 className="truncate text-lg font-bold">
                      {
                        detailItem.exercise_name
                      }
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      removeItem(
                        detailIndex,
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    aria-label="운동 삭제"
                  >
                    <X
                      size={19}
                    />
                  </button>
                </div>
              </header>

              <main className="px-5 pt-6">
                {/* DB가 결정한 기록 타입. 사용자가 변경하지 않음 */}
                <div className="mb-4 flex items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-3">
                  <span className="text-xs text-zinc-500">
                    기록 방식
                  </span>

                  <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400">
                    {
                      recordTypeLabel(
                        detailItem.record_type,
                      )
                    }
                  </span>
                </div>

                <section className="rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-5">
                  <p className="text-xs font-semibold text-zinc-400">
                    목표 설정
                  </p>

                  {/* 무게 + 횟수 */}
                  {detailItem.record_type ===
                    'weight_reps' && (
                    <div className="mt-5 space-y-5">
                      <NumberControl
                        label="목표 무게"
                        value={
                          detailItem.target_weight_kg
                        }
                        unit="kg"
                        step={1}
                        fastStep={5}
                        min={0}
                        decimal
                        formatValue={
                          formatWeight
                        }
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'target_weight_kg',
                            value,
                          )
                        }
                      />

                      <NumberControl
                        label="목표 횟수"
                        value={
                          detailItem.target_reps
                        }
                        unit="회"
                        step={1}
                        fastStep={5}
                        min={1}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'target_reps',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />

                      <NumberControl
                        label="세트 수"
                        value={
                          detailItem.target_sets
                        }
                        unit="세트"
                        step={1}
                        fastStep={5}
                        min={1}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'target_sets',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />

                      <NumberControl
                        label="휴식 시간"
                        value={
                          detailItem.rest_seconds
                        }
                        unit="초"
                        step={15}
                        fastStep={30}
                        min={0}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'rest_seconds',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />
                    </div>
                  )}

                  {/* 횟수 */}
                  {detailItem.record_type ===
                    'reps_only' && (
                    <div className="mt-5 space-y-5">
                      <NumberControl
                        label="목표 횟수"
                        value={
                          detailItem.target_reps
                        }
                        unit="회"
                        step={1}
                        fastStep={5}
                        min={1}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'target_reps',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />

                      <NumberControl
                        label="세트 수"
                        value={
                          detailItem.target_sets
                        }
                        unit="세트"
                        step={1}
                        fastStep={5}
                        min={1}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'target_sets',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />

                      <NumberControl
                        label="휴식 시간"
                        value={
                          detailItem.rest_seconds
                        }
                        unit="초"
                        step={15}
                        fastStep={30}
                        min={0}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'rest_seconds',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />
                    </div>
                  )}

                  {/* 시간 */}
                  {detailItem.record_type ===
                    'time' && (
                    <div className="mt-5 space-y-5">
                      <NumberControl
                        label="운동 시간"
                        value={
                          detailItem.target_reps
                        }
                        unit="초"
                        step={15}
                        fastStep={30}
                        min={1}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'target_reps',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />

                      <NumberControl
                        label="세트 수"
                        value={
                          detailItem.target_sets
                        }
                        unit="세트"
                        step={1}
                        fastStep={5}
                        min={1}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'target_sets',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />

                      <NumberControl
                        label="휴식 시간"
                        value={
                          detailItem.rest_seconds
                        }
                        unit="초"
                        step={15}
                        fastStep={30}
                        min={0}
                        onChange={(
                          value,
                        ) =>
                          updateItem(
                            detailIndex,
                            'rest_seconds',
                            Math.round(
                              value,
                            ),
                          )
                        }
                      />
                    </div>
                  )}
                </section>

                <button
                  type="button"
                  onClick={() =>
                    setDetailIndex(
                      null,
                    )
                  }
                  className="mt-6 w-full rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white transition-colors hover:bg-blue-500"
                >
                  설정 완료
                </button>
              </main>
            </div>
          </div>
        )}
    </>
  );
}

function NumberControl({
  label,
  value,
  unit,
  step,
  fastStep,
  min,
  decimal = false,
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  fastStep?: number;
  min: number;
  decimal?: boolean;
  formatValue?: (
    value: number,
  ) => string;
  onChange: (
    value: number,
  ) => void;
}) {
  const [
    keypadOpen,
    setKeypadOpen,
  ] = useState(false);

  const [
    keypadValue,
    setKeypadValue,
  ] = useState('');

  const effectiveFastStep =
    fastStep ??
    step * 5;

  const display =
    formatValue
      ? formatValue(
          value,
        )
      : String(value);

  const normalizeNumber = (
    nextValue: number,
  ) => {
    const clamped =
      Math.max(
        min,
        nextValue,
      );

    return decimal
      ? Math.round(
          clamped * 10,
        ) / 10
      : Math.round(
          clamped,
        );
  };

  const commitValue = (
    nextValue: number,
  ) => {
    if (
      !Number.isFinite(
        nextValue,
      )
    ) {
      return;
    }

    onChange(
      normalizeNumber(
        nextValue,
      ),
    );
  };

  const formatQuickValue = (
    nextValue: number,
  ) => {
    const normalized =
      normalizeNumber(
        nextValue,
      );

    return decimal
      ? (
          Number.isInteger(
            normalized,
          )
            ? String(
                normalized,
              )
            : normalized.toFixed(
                1,
              )
        )
      : String(
          normalized,
        );
  };

  const openKeypad = () => {
    setKeypadValue(
      display,
    );

    setKeypadOpen(
      true,
    );
  };

  const applyKeypadValue = (
    next: string,
  ) => {
    setKeypadValue(
      next,
    );

    if (
      next === '' ||
      next === '.' ||
      next.endsWith('.')
    ) {
      return;
    }

    const parsed =
      Number(next);

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      commitValue(
        parsed,
      );
    }
  };

  const appendDigit = (
    digit: string,
  ) => {
    if (
      digit === '.'
    ) {
      if (
        !decimal ||
        keypadValue.includes(
          '.',
        )
      ) {
        return;
      }

      applyKeypadValue(
        keypadValue.length ===
          0
          ? '0.'
          : `${keypadValue}.`,
      );

      return;
    }

    const next =
      keypadValue === '0'
        ? digit
        : `${keypadValue}${digit}`;

    applyKeypadValue(
      next,
    );
  };

  const backspace = () => {
    applyKeypadValue(
      keypadValue.slice(
        0,
        -1,
      ),
    );
  };

  const clearValue = () => {
    setKeypadValue('');
  };

  const adjust = (
    amount: number,
  ) => {
    const next =
      normalizeNumber(
        value + amount,
      );

    onChange(next);

    if (keypadOpen) {
      setKeypadValue(
        formatQuickValue(
          next,
        ),
      );
    }
  };

  const quickButtonClass =
    'h-10 rounded-xl border border-zinc-800 bg-zinc-950/70 text-xs font-bold text-zinc-400 transition-colors active:bg-zinc-800 active:text-white';

  const keypadButtonClass =
    'flex h-14 items-center justify-center rounded-2xl bg-zinc-900 text-xl font-semibold text-white transition active:scale-[0.97] active:bg-zinc-800';

  return (
    <>
      <div>
        <p className="mb-2 text-xs text-zinc-500">
          {label}
        </p>

        <button
          type="button"
          onClick={
            openKeypad
          }
          className="relative flex h-14 w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/60 px-12 text-base font-bold text-white transition-colors active:border-blue-500"
          aria-label={`${label} 숫자 입력`}
        >
          <span>
            {display}
          </span>

          <span className="absolute right-4 text-xs font-medium text-zinc-600">
            {unit}
          </span>
        </button>

        <div className="mt-2 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() =>
              adjust(
                -effectiveFastStep,
              )
            }
            className={
              quickButtonClass
            }
          >
            -{effectiveFastStep}
          </button>

          <button
            type="button"
            onClick={() =>
              adjust(
                -step,
              )
            }
            className={
              quickButtonClass
            }
          >
            -{step}
          </button>

          <button
            type="button"
            onClick={() =>
              adjust(
                step,
              )
            }
            className={
              quickButtonClass
            }
          >
            +{step}
          </button>

          <button
            type="button"
            onClick={() =>
              adjust(
                effectiveFastStep,
              )
            }
            className="h-10 rounded-xl border border-blue-500/20 bg-blue-500/10 text-xs font-bold text-blue-400 transition-colors active:bg-blue-500/20"
          >
            +{effectiveFastStep}
          </button>
        </div>
      </div>

      {keypadOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-end bg-black/65 backdrop-blur-sm"
          onClick={() =>
            setKeypadOpen(
              false,
            )
          }
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-[28px] border-t border-zinc-800 bg-zinc-950 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 shadow-2xl"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700" />

            <div className="mb-4 text-center">
              <p className="text-xs font-medium text-zinc-500">
                {label}
              </p>

              <div className="mt-1 flex items-baseline justify-center gap-1">
                <span className="text-3xl font-bold text-white">
                  {keypadValue ||
                    '0'}
                </span>

                <span className="text-sm font-medium text-zinc-500">
                  {unit}
                </span>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() =>
                  adjust(
                    -effectiveFastStep,
                  )
                }
                className={
                  quickButtonClass
                }
              >
                -{effectiveFastStep}
              </button>

              <button
                type="button"
                onClick={() =>
                  adjust(
                    -step,
                  )
                }
                className={
                  quickButtonClass
                }
              >
                -{step}
              </button>

              <button
                type="button"
                onClick={() =>
                  adjust(
                    step,
                  )
                }
                className={
                  quickButtonClass
                }
              >
                +{step}
              </button>

              <button
                type="button"
                onClick={() =>
                  adjust(
                    effectiveFastStep,
                  )
                }
                className="h-10 rounded-xl border border-blue-500/20 bg-blue-500/10 text-xs font-bold text-blue-400 active:bg-blue-500/20"
              >
                +{effectiveFastStep}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                '1',
                '2',
                '3',
                '4',
                '5',
                '6',
                '7',
                '8',
                '9',
              ].map(
                (digit) => (
                  <button
                    key={
                      digit
                    }
                    type="button"
                    onClick={() =>
                      appendDigit(
                        digit,
                      )
                    }
                    className={
                      keypadButtonClass
                    }
                  >
                    {digit}
                  </button>
                ),
              )}

              {decimal ? (
                <button
                  type="button"
                  onClick={() =>
                    appendDigit(
                      '.',
                    )
                  }
                  className={
                    keypadButtonClass
                  }
                >
                  .
                </button>
              ) : (
                <button
                  type="button"
                  onClick={
                    clearValue
                  }
                  className="flex h-14 items-center justify-center rounded-2xl bg-zinc-900 text-sm font-semibold text-zinc-400 active:bg-zinc-800"
                >
                  초기화
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  appendDigit(
                    '0',
                  )
                }
                className={
                  keypadButtonClass
                }
              >
                0
              </button>

              <button
                type="button"
                onClick={
                  backspace
                }
                className="flex h-14 items-center justify-center rounded-2xl bg-zinc-900 text-xl font-semibold text-zinc-300 active:bg-zinc-800"
                aria-label="한 자리 삭제"
              >
                ⌫
              </button>
            </div>

            {decimal && (
              <button
                type="button"
                onClick={
                  clearValue
                }
                className="mt-2 h-10 w-full rounded-xl text-xs font-medium text-zinc-500 active:bg-zinc-900"
              >
                입력값 초기화
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setKeypadOpen(
                  false,
                )
              }
              className="mt-3 h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white transition active:bg-blue-500"
            >
              완료
            </button>
          </div>
        </div>
      )}
    </>
  );
}
