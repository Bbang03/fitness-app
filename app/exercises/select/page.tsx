'use client';

import {
  Suspense,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import {
  ChevronLeft,
  Minus,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';

import { useStore } from '@/lib/store';

import {
  BODY_PARTS,
  EQUIPMENTS,
  EXERCISE_DB,
  RECORD_TYPE_LABEL,
  searchExercises,
  type BodyPart,
  type Equipment,
  type Exercise,
  type RecordType,
} from '@/lib/exerciseData';

const MULTI_EXERCISE_SELECTION_KEY =
  'chagok-routine-multi-exercise-selection-v1';

// ─────────────────────────────────────────────
// Custom exercise
// ─────────────────────────────────────────────

function CustomForm({
  targetIndex,
}: {
  targetIndex: number;
}) {
  const {
    setPendingExercise,
  } = useStore();

  const router =
    useRouter();

  const [
    name,
    setName,
  ] = useState('');

  const [
    recordType,
    setRecordType,
  ] =
    useState<RecordType>(
      'weight_reps',
    );

  const [
    err,
    setErr,
  ] = useState('');

  const handleAdd =
    () => {
      const trimmedName =
        name.trim();

      if (!trimmedName) {
        setErr(
          '운동 이름을 입력해주세요.',
        );

        return;
      }

      setPendingExercise({
        name:
          trimmedName,

        record_type:
          recordType,

        targetIndex,
      });

      router.back();
    };

  return (
    <div className="space-y-4 px-4 pb-8 pt-4">
      <div>
        <label className="mb-1.5 block text-xs text-zinc-400">
          운동 이름
        </label>

        <input
          autoFocus
          type="text"
          value={name}
          onChange={(
            event,
          ) => {
            setName(
              event.target
                .value,
            );

            setErr('');
          }}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
          placeholder="예: 스미스 머신 힙 쓰러스트"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs text-zinc-400">
          기록 방식
        </label>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              'weight_reps',
              'reps_only',
              'time',
            ] as RecordType[]
          ).map(
            (
              type,
            ) => (
              <button
                key={
                  type
                }
                type="button"
                onClick={() =>
                  setRecordType(
                    type,
                  )
                }
                className={`rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                  recordType ===
                  type
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                }`}
              >
                {
                  RECORD_TYPE_LABEL[
                    type
                  ]
                }
              </button>
            ),
          )}
        </div>
      </div>

      {err && (
        <p className="text-xs text-red-400">
          {err}
        </p>
      )}

      <button
        type="button"
        onClick={
          handleAdd
        }
        className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition-colors hover:bg-blue-500"
      >
        추가
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Filter chip
// ─────────────────────────────────────────────

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
      }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// Exercise row
// ─────────────────────────────────────────────

const BODY_COLOR: Record<
  BodyPart,
  string
> = {
  가슴: 'text-rose-400',
  등: 'text-blue-400',
  어깨: 'text-violet-400',
  삼두: 'text-amber-400',
  이두: 'text-emerald-400',
  하체: 'text-orange-400',
  복근: 'text-cyan-400',
  전완: 'text-lime-400',
  전신: 'text-fuchsia-400',
  유산소: 'text-pink-400',
};

function ExerciseRow({
  exercise,
  isFavorite,
  multiSelect,
  selectionOrders,
  onSelect,
  onRemoveOne,
  onToggleFav,
}: {
  exercise: Exercise;

  isFavorite: boolean;

  multiSelect: boolean;

  selectionOrders:
    number[];

  onSelect: (
    exercise: Exercise,
  ) => void;

  onRemoveOne: (
    exercise: Exercise,
  ) => void;

  onToggleFav: (
    id: string,
  ) => void;
}) {
  const selected =
    selectionOrders.length >
    0;

  const selectionLabel =
    selectionOrders.join(
      ', ',
    );

  return (
    <div
      className={`flex items-center border-b border-zinc-800/50 transition-colors last:border-0 ${
        selected
          ? 'bg-blue-500/5'
          : ''
      }`}
    >
      <button
        type="button"
        onClick={() =>
          onSelect(
            exercise,
          )
        }
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-800/40"
      >
        {multiSelect && (
          <div
            className={`flex h-7 min-w-7 flex-shrink-0 items-center justify-center rounded-full border px-2 text-[10px] font-bold ${
              selected
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-zinc-700 text-zinc-600'
            }`}
          >
            {selected ? (
              selectionLabel
            ) : (
              <Plus
                size={12}
              />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {
              exercise.name
            }
          </p>

          <div className="mt-0.5 flex items-center gap-2">
            <span
              className={`text-[10px] font-medium ${
                BODY_COLOR[
                  exercise
                    .body_part
                ]
              }`}
            >
              {
                exercise.body_part
              }
            </span>

            <span className="text-[10px] text-zinc-600">
              {
                exercise.equipment
              }
            </span>
          </div>
        </div>

        {!multiSelect && (
          <Plus
            size={16}
            className="flex-shrink-0 text-blue-400"
          />
        )}
      </button>

      {multiSelect &&
        selected && (
          <button
            type="button"
            onClick={() =>
              onRemoveOne(
                exercise,
              )
            }
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label={`${exercise.name} 선택 1개 취소`}
          >
            <Minus
              size={17}
            />
          </button>
        )}

      <button
        type="button"
        onClick={() =>
          onToggleFav(
            exercise.id,
          )
        }
        className="flex-shrink-0 px-3 py-4"
        aria-label={
          isFavorite
            ? '즐겨찾기 해제'
            : '즐겨찾기 추가'
        }
      >
        <Star
          size={16}
          className={
            isFavorite
              ? 'fill-amber-400 text-amber-400'
              : 'text-zinc-600'
          }
        />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Select page
// ─────────────────────────────────────────────

function SelectInner() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const {
    favoriteExerciseIds,
    toggleFavorite,
    setPendingExercise,
  } = useStore();

  const targetIndex =
    Number(
      searchParams.get(
        'idx',
      ) ?? '0',
    );

  const multiSelect =
    searchParams.get(
      'mode',
    ) === 'multi';

  const [
    tab,
    setTab,
  ] =
    useState<
      | 'all'
      | 'favorites'
      | 'custom'
    >('all');

  const [
    query,
    setQuery,
  ] = useState('');

  const [
    bodyFilter,
    setBodyFilter,
  ] =
    useState<BodyPart | null>(
      null,
    );

  const [
    equipFilter,
    setEquipFilter,
  ] =
    useState<Equipment | null>(
      null,
    );

  const [
    selectedExercises,
    setSelectedExercises,
  ] =
    useState<Exercise[]>([]);

  const results =
    useMemo(() => {
      if (
        tab ===
        'favorites'
      ) {
        const favoriteSet =
          new Set(
            favoriteExerciseIds,
          );

        return EXERCISE_DB.filter(
          (
            exercise,
          ) =>
            favoriteSet.has(
              exercise.id,
            ) &&
            (
              !bodyFilter ||
              exercise.body_part ===
                bodyFilter
            ) &&
            (
              !equipFilter ||
              exercise.equipment ===
                equipFilter
            ) &&
            (
              !query ||
              exercise.name
                .toLowerCase()
                .includes(
                  query
                    .toLowerCase(),
                )
            ),
        );
      }

      return searchExercises(
        query,
        bodyFilter,
        equipFilter,
      );
    }, [
      query,
      bodyFilter,
      equipFilter,
      tab,
      favoriteExerciseIds,
    ]);

  const handleSelect = (
    exercise: Exercise,
  ) => {
    if (
      !multiSelect
    ) {
      setPendingExercise({
        name:
          exercise.name,

        record_type:
          exercise.record_type,

        targetIndex,
      });

      router.back();

      return;
    }

    // 중복 선택 허용:
    // 같은 운동을 누를 때마다 배열 뒤에 새 항목으로 추가한다.
    setSelectedExercises(
      (
        previous,
      ) => [
        ...previous,
        exercise,
      ],
    );
  };

  const handleRemoveOne = (
    exercise: Exercise,
  ) => {
    setSelectedExercises(
      (
        previous,
      ) => {
        // 같은 운동이 여러 번 있다면
        // 가장 마지막에 선택한 1개만 제거한다.
        const lastIndex =
          previous
            .map(
              (
                item,
              ) =>
                item.id,
            )
            .lastIndexOf(
              exercise.id,
            );

        if (
          lastIndex ===
          -1
        ) {
          return previous;
        }

        return previous.filter(
          (
            _,
            index,
          ) =>
            index !==
            lastIndex,
        );
      },
    );
  };

  const handleAddSelected =
    () => {
      if (
        selectedExercises.length ===
        0
      ) {
        return;
      }

      window.sessionStorage.setItem(
        MULTI_EXERCISE_SELECTION_KEY,

        JSON.stringify({
          targetIndex,

          exercises:
            selectedExercises.map(
              (
                exercise,
              ) => ({
                name:
                  exercise.name,

                record_type:
                  exercise.record_type,
              }),
            ),
        }),
      );

      router.back();
    };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-zinc-800/50 bg-zinc-950/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pb-3 pt-10">
          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="-ml-1 p-1 text-zinc-400 transition-colors hover:text-white"
            aria-label="뒤로가기"
          >
            <ChevronLeft
              size={24}
            />
          </button>

          <h1 className="flex-1 text-lg font-bold">
            운동 선택
          </h1>

          {multiSelect &&
            selectedExercises.length >
              0 && (
              <span className="text-sm font-semibold text-blue-400">
                {
                  selectedExercises.length
                }
                개
              </span>
            )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {(
            [
              'all',
              'favorites',
              'custom',
            ] as const
          ).map(
            (
              currentTab,
            ) => (
              <button
                key={
                  currentTab
                }
                type="button"
                onClick={() =>
                  setTab(
                    currentTab,
                  )
                }
                className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${
                  tab ===
                  currentTab
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400'
                }`}
              >
                {currentTab ===
                'all'
                  ? '전체'
                  : currentTab ===
                      'favorites'
                    ? '즐겨찾기'
                    : '직접 입력'}
              </button>
            ),
          )}
        </div>
      </div>

      {tab ===
      'custom' ? (
        <CustomForm
          targetIndex={
            targetIndex
          }
        />
      ) : (
        <>
          {/* Search / filters */}
          <div className="sticky top-[108px] z-10 bg-zinc-950/95 px-4 pb-2 pt-3 backdrop-blur">
            <div className="relative mb-2">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />

              <input
                type="text"
                value={query}
                onChange={(
                  event,
                ) =>
                  setQuery(
                    event.target
                      .value,
                  )
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 pl-9 pr-9 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                placeholder="운동 이름 검색..."
              />

              {query && (
                <button
                  type="button"
                  onClick={() =>
                    setQuery('')
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                  aria-label="검색어 지우기"
                >
                  <X
                    size={15}
                  />
                </button>
              )}
            </div>

            {/* Body filters */}
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              <Chip
                label="전체"
                active={
                  !bodyFilter
                }
                onClick={() =>
                  setBodyFilter(
                    null,
                  )
                }
              />

              {BODY_PARTS.map(
                (
                  bodyPart,
                ) => (
                  <Chip
                    key={
                      bodyPart
                    }
                    label={
                      bodyPart
                    }
                    active={
                      bodyFilter ===
                      bodyPart
                    }
                    onClick={() =>
                      setBodyFilter(
                        bodyFilter ===
                          bodyPart
                          ? null
                          : bodyPart,
                      )
                    }
                  />
                ),
              )}
            </div>

            {/* Equipment filters */}
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 pt-1.5">
              <Chip
                label="전체"
                active={
                  !equipFilter
                }
                onClick={() =>
                  setEquipFilter(
                    null,
                  )
                }
              />

              {EQUIPMENTS.map(
                (
                  equipment,
                ) => (
                  <Chip
                    key={
                      equipment
                    }
                    label={
                      equipment
                    }
                    active={
                      equipFilter ===
                      equipment
                    }
                    onClick={() =>
                      setEquipFilter(
                        equipFilter ===
                          equipment
                          ? null
                          : equipment,
                      )
                    }
                  />
                ),
              )}
            </div>

            <p className="mt-1.5 text-[10px] text-zinc-600">
              {
                results.length
              }
              개 운동
            </p>
          </div>

          {/* Exercise list */}
          <div
            className={`mx-4 mt-2 flex-1 overflow-hidden rounded-2xl bg-zinc-900 ${
              multiSelect
                ? 'mb-28'
                : 'mb-6'
            }`}
          >
            {results.length ===
            0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                운동을 찾을 수
                없습니다.

                <button
                  type="button"
                  onClick={() =>
                    setTab(
                      'custom',
                    )
                  }
                  className="mx-auto mt-2 block text-sm text-blue-400"
                >
                  직접 입력하기 →
                </button>
              </div>
            ) : (
              results.map(
                (
                  exercise,
                ) => {
                  const selectionOrders =
                    selectedExercises
                      .map(
                        (
                          selected,
                          selectedIndex,
                        ) =>
                          selected.id ===
                          exercise.id
                            ? selectedIndex +
                              1
                            : null,
                      )
                      .filter(
                        (
                          value,
                        ): value is number =>
                          value !==
                          null,
                      );

                  return (
                    <ExerciseRow
                      key={
                        exercise.id
                      }
                      exercise={
                        exercise
                      }
                      isFavorite={favoriteExerciseIds.includes(
                        exercise.id,
                      )}
                      multiSelect={
                        multiSelect
                      }
                      selectionOrders={
                        selectionOrders
                      }
                      onSelect={
                        handleSelect
                      }
                      onRemoveOne={
                        handleRemoveOne
                      }
                      onToggleFav={
                        toggleFavorite
                      }
                    />
                  );
                },
              )
            )}
          </div>
        </>
      )}

      {/* Bottom CTA */}
      {multiSelect &&
        tab !==
          'custom' && (
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800 bg-zinc-950/95 px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <button
              type="button"
              disabled={
                selectedExercises.length ===
                0
              }
              onClick={
                handleAddSelected
              }
              className="w-full rounded-2xl bg-blue-600 py-3.5 font-semibold text-white transition-colors disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              +{' '}
              {
                selectedExercises.length
              }{' '}
              운동 추가
            </button>
          </div>
        )}
    </div>
  );
}

export default function SelectExercisePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-500">
          로딩 중...
        </div>
      }
    >
      <SelectInner />
    </Suspense>
  );
}