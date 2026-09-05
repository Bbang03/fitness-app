'use client';

import {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  BookOpen,
  Check,
  ChevronLeft,
  Dumbbell,
  GripVertical,
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
  Omit<
    RoutineItem,
    'id'
  >;

const DEFAULT_ITEM = (
  order: number,
): DraftItem => ({
  order,

  exercise_name:
    '',

  target_sets:
    3,

  target_reps:
    10,

  rest_seconds:
    90,

  record_type:
    'weight_reps',
});

export default function NewRoutinePage() {
  const router =
    useRouter();

  const {
    currentUser,

    addRoutine,

    pendingExercise,
    setPendingExercise,

    routineDraft,
    setRoutineDraft,
    clearRoutineDraft,
  } = useStore();

  const [name, setName] =
    useState(
      () =>
        routineDraft?.name ??
        '',
    );

  const [
    items,
    setItems,
  ] =
    useState<
      DraftItem[]
    >(
      () =>
        routineDraft?.items ??
        [
          DEFAULT_ITEM(
            0,
          ),
        ],
    );

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

  const user =
    currentUser();

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
  // Exercise picker result
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

      record_type,

      targetIndex,
    } =
      pendingExercise;

    setItems(
      (
        previous,
      ) => {
        const next =
          [
            ...previous,
          ];

        if (
          targetIndex <
          next.length
        ) {
          next[
            targetIndex
          ] = {
            ...next[
              targetIndex
            ],

            exercise_name:
              exerciseName,

            record_type,
          };
        }

        return next;
      },
    );

    setPendingExercise(
      null,
    );
  }, [
    pendingExercise,
    setPendingExercise,
  ]);

  if (!user) {
    return null;
  }

  // ─────────────────────────────────────────────
  // Item handlers
  // ─────────────────────────────────────────────

  const addItem =
    () => {
      setItems(
        (
          previous,
        ) => [
          ...previous,

          DEFAULT_ITEM(
            previous.length,
          ),
        ],
      );

      setError('');
    };

  const removeItem =
    (
      index:
        number,
    ) => {
      if (
        items.length ===
        1
      ) {
        return;
      }

      setItems(
        (
          previous,
        ) =>
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
              (
                item,
                itemIndex,
              ) => ({
                ...item,

                order:
                  itemIndex,
              }),
            ),
      );

      setError('');
    };

  const updateItem = <
    K extends keyof DraftItem,
  >(
    index: number,
    field: K,
    value:
      DraftItem[K],
  ) => {
    setItems(
      (
        previous,
      ) =>
        previous.map(
          (
            item,
            itemIndex,
          ) =>
            itemIndex ===
            index
              ? {
                  ...item,

                  [field]:
                    value,
                }
              : item,
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
        React.FormEvent,
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
        items.some(
          (
            item,
          ) =>
            !item.exercise_name.trim(),
        )
      ) {
        setError(
          '모든 운동을 선택해주세요.',
        );

        return;
      }

      setError('');
      setIsSaving(
        true,
      );

      try {
        const id =
          await addRoutine(
            name.trim(),
            items,
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

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-zinc-950/90 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 pt-10 pb-4">
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
            onChange={(event) => {
              setName(
                event.target.value,
              );

              setError('');
            }}
            disabled={
              isSaving
            }
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 text-white placeholder-zinc-600 transition-colors focus:border-blue-500 focus:outline-none disabled:opacity-50"
            placeholder="예: Push Day, 상체 A, 가슴·삼두"
            autoFocus
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
                운동별 목표와 휴식 시간을 설정하세요.
              </p>
            </div>

            <span className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs text-zinc-500">
              {
                items.length
              }
              개
            </span>
          </div>

          <div className="space-y-3">
            {items.map(
              (
                item,
                index,
              ) => (
                <article
                  key={
                    index
                  }
                  className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/70"
                >
                  {/* Item header */}
                  <div className="flex items-center gap-3 border-b border-zinc-800/70 px-4 py-4">
                    <GripVertical
                      size={16}
                      className="flex-shrink-0 text-zinc-700"
                    />

                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xs font-bold text-blue-400">
                      {
                        index +
                        1
                      }
                    </div>

                    <div className="min-w-0 flex-1">
                      {item.exercise_name ? (
                        <p className="truncate text-sm font-semibold">
                          {
                            item.exercise_name
                          }
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-600">
                          운동을 선택해주세요
                        </p>
                      )}
                    </div>

                    <Link
                      href={`/exercises/select?idx=${index}`}
                      onClick={() => {
                        setRoutineDraft({
                          name,
                          items,
                        });
                      }}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400"
                    >
                      <BookOpen
                        size={13}
                      />

                      선택
                    </Link>

                    <button
                      type="button"
                      onClick={() =>
                        removeItem(
                          index,
                        )
                      }
                      disabled={
                        items.length ===
                          1 ||
                        isSaving
                      }
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-20"
                      aria-label="운동 삭제"
                    >
                      <X
                        size={16}
                      />
                    </button>
                  </div>

                  <div className="p-4">
                    {/* Record type */}
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                      기록 방식
                    </p>

                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-950/60 p-1">
                      {(
                        [
                          'weight_reps',
                          'reps_only',
                          'time',
                        ] as RecordType[]
                      ).map(
                        (
                          recordType,
                        ) => {
                          const active =
                            item.record_type ===
                            recordType;

                          return (
                            <button
                              key={
                                recordType
                              }
                              type="button"
                              onClick={() =>
                                updateItem(
                                  index,
                                  'record_type',
                                  recordType,
                                )
                              }
                              disabled={
                                isSaving
                              }
                              className={`rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                                active
                                  ? 'bg-zinc-800 text-white'
                                  : 'text-zinc-600 hover:text-zinc-400'
                              }`}
                            >
                              {recordType ===
                              'weight_reps'
                                ? '무게 + 횟수'
                                : recordType ===
                                    'reps_only'
                                  ? '횟수'
                                  : '시간'}
                            </button>
                          );
                        },
                      )}
                    </div>

                    {/* Targets */}
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <TargetControl
                        label="세트"
                        value={
                          item.target_sets
                        }
                        onDecrease={() =>
                          updateItem(
                            index,
                            'target_sets',
                            Math.max(
                              1,
                              item.target_sets -
                                1,
                            ),
                          )
                        }
                        onIncrease={() =>
                          updateItem(
                            index,
                            'target_sets',
                            item.target_sets +
                              1,
                          )
                        }
                      />

                      <TargetControl
                        label={
                          item.record_type ===
                          'time'
                            ? '목표 시간'
                            : '목표 횟수'
                        }
                        value={
                          item.target_reps
                        }
                        unit={
                          item.record_type ===
                          'time'
                            ? '초'
                            : '회'
                        }
                        onDecrease={() =>
                          updateItem(
                            index,
                            'target_reps',
                            Math.max(
                              1,
                              item.target_reps -
                                (
                                  item.record_type ===
                                  'time'
                                    ? 15
                                    : 1
                                ),
                            ),
                          )
                        }
                        onIncrease={() =>
                          updateItem(
                            index,
                            'target_reps',
                            item.target_reps +
                              (
                                item.record_type ===
                                'time'
                                  ? 15
                                  : 1
                              ),
                          )
                        }
                      />

                      <TargetControl
                        label="휴식"
                        value={
                          item.rest_seconds
                        }
                        unit="초"
                        onDecrease={() =>
                          updateItem(
                            index,
                            'rest_seconds',
                            Math.max(
                              0,
                              item.rest_seconds -
                                30,
                            ),
                          )
                        }
                        onIncrease={() =>
                          updateItem(
                            index,
                            'rest_seconds',
                            item.rest_seconds +
                              30,
                          )
                        }
                      />
                    </div>
                  </div>
                </article>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={
              addItem
            }
            disabled={
              isSaving
            }
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/20 py-4 text-sm font-medium text-zinc-500 transition-colors hover:border-blue-500/40 hover:text-blue-400 disabled:opacity-50"
          >
            <Plus
              size={17}
            />

            운동 추가
          </button>
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

      {/* Bottom save button */}
      <footer className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-white/[0.06] bg-zinc-950/90 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-xl">
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
  );
}

function TargetControl({
  label,
  value,
  unit,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  unit?: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div>
      <p className="mb-2 text-center text-[10px] text-zinc-600">
        {label}
      </p>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50">
        <div className="flex min-h-12 items-center justify-center px-1">
          <span className="text-sm font-bold">
            {value}

            {unit && (
              <span className="ml-0.5 text-[10px] font-medium text-zinc-600">
                {unit}
              </span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={
              onDecrease
            }
            className="py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            −
          </button>

          <button
            type="button"
            onClick={
              onIncrease
            }
            className="border-l border-zinc-800 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}