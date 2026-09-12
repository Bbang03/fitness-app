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

import {
  useParams,
  useRouter,
} from 'next/navigation';

import {
  Check,
  ChevronLeft,
  MoreHorizontal,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { useStore } from '@/lib/store';

import {
  formatDuration,
} from '@/lib/utils';

import type {
  RecordType,
  RoutineItem,
} from '@/lib/types';

type DraftItem =
  Omit<RoutineItem, 'id'>;

type CardMetric = {
  top: number;
  bottom: number;
  center: number;
  height: number;
};

type DragRuntime = {
  sourceIndex: number | null;
  pointerId: number | null;

  startX: number;
  startY: number;

  dragging: boolean;
  moved: boolean;

  insertionIndex: number | null;
  supersetTarget: number | null;

  startScrollY: number;

  metrics: Array<
    CardMetric | null
  >;
};

const LONG_PRESS_MS = 350;

const DRAG_MOVE_THRESHOLD =
  10;

const CARD_GAP_PX = 8;

const DEFAULT_ITEM = (
  order: number,
): DraftItem => ({
  order,

  exercise_name: '',

  target_sets: 3,
  target_reps: 10,

  rest_seconds: 90,

  record_type:
    'weight_reps',

  superset_group: null,
});

function createEmptyDragRuntime(): DragRuntime {
  return {
    sourceIndex: null,
    pointerId: null,

    startX: 0,
    startY: 0,

    dragging: false,
    moved: false,

    insertionIndex: null,
    supersetTarget: null,

    startScrollY: 0,

    metrics: [],
  };
}

function normalizeItems(
  source: DraftItem[],
): DraftItem[] {
  const groupCounts =
    new Map<string, number>();

  source.forEach((item) => {
    if (!item.superset_group) {
      return;
    }

    groupCounts.set(
      item.superset_group,
      (
        groupCounts.get(
          item.superset_group,
        ) ?? 0
      ) + 1,
    );
  });

  return source.map(
    (item, index) => ({
      ...item,

      order: index,

      superset_group:
        item.superset_group &&
        (
          groupCounts.get(
            item.superset_group,
          ) ?? 0
        ) >= 2
          ? item.superset_group
          : null,
    }),
  );
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

function exerciseSummary(
  item: DraftItem,
) {
  const target =
    item.record_type ===
    'time'
      ? formatDuration(
          item.target_reps,
        )
      : `${item.target_reps}회`;

  return `${item.target_sets}세트 · ${target} · 휴식 ${formatDuration(
    item.rest_seconds,
  )}`;
}

export default function RoutineDetailPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const id =
    params.id as string;

  const {
    currentUser,

    routines,
    updateRoutine,
    startWorkout,

    pendingExercise,
    setPendingExercise,

    editRoutineDraft,
    setEditRoutineDraft,
    clearEditRoutineDraft,
  } = useStore();

  const user =
    currentUser();

  const hasMatchingDraft =
    editRoutineDraft
      ?.routineId === id;

  const [
    name,
    setName,
  ] = useState(
    () =>
      hasMatchingDraft
        ? editRoutineDraft.name
        : '',
  );

  const [
    items,
    setItems,
  ] = useState<DraftItem[]>(
    () =>
      hasMatchingDraft
        ? normalizeItems(
            editRoutineDraft.items,
          )
        : [],
  );

  const [
    initialized,
    setInitialized,
  ] = useState(
    () =>
      hasMatchingDraft,
  );

  const [
    error,
    setError,
  ] = useState('');

  const [
    saved,
    setSaved,
  ] = useState(false);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    detailIndex,
    setDetailIndex,
  ] = useState<
    number | null
  >(null);

  const [
    menuIndex,
    setMenuIndex,
  ] = useState<
    number | null
  >(null);

  // ─────────────────────────────────────────────
  // Drag state
  // ─────────────────────────────────────────────

  const [
    draggingIndex,
    setDraggingIndex,
  ] = useState<
    number | null
  >(null);

  const [
    dragOffsetY,
    setDragOffsetY,
  ] = useState(0);

  const [
    insertionIndex,
    setInsertionIndex,
  ] = useState<
    number | null
  >(null);

  const [
    supersetTargetIndex,
    setSupersetTargetIndex,
  ] = useState<
    number | null
  >(null);

  const cardRefs =
    useRef<
      Array<
        HTMLElement | null
      >
    >([]);

  const longPressTimerRef =
    useRef<number | null>(
      null,
    );

  const suppressClickRef =
    useRef(false);

  const dragStateRef =
    useRef<DragRuntime>(
      createEmptyDragRuntime(),
    );

  // ─────────────────────────────────────────────
  // Initial load
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      router.replace(
        '/login',
      );

      return;
    }

    if (initialized) {
      return;
    }

    if (
      editRoutineDraft
        ?.routineId === id
    ) {
      setName(
        editRoutineDraft.name,
      );

      setItems(
        normalizeItems(
          editRoutineDraft.items,
        ),
      );

      setInitialized(true);

      return;
    }

    const routine =
      routines.find(
        (item) =>
          item.id === id,
      );

    if (!routine) {
      router.replace(
        '/routines',
      );

      return;
    }

    if (
      routine.user_id !==
      user.id
    ) {
      router.replace(
        '/routines',
      );

      return;
    }

    setName(
      routine.name,
    );

    setItems(
      normalizeItems(
        [...routine.items]
          .sort(
            (a, b) =>
              a.order -
              b.order,
          )
          .map(
            (item) => ({
              ...item,

              record_type:
                item.record_type ??
                'weight_reps',

              superset_group:
                item.superset_group ??
                null,
            }),
          ),
      ),
    );

    setInitialized(true);
  }, [
    id,
    user?.id,
    initialized,
    editRoutineDraft,
    routines,
    router,
  ]);

  // ─────────────────────────────────────────────
  // Exercise picker result
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!pendingExercise) {
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
      (previous) => {
        const next =
          [...previous];

        if (
          targetIndex >= 0 &&
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

        return normalizeItems(
          next,
        );
      },
    );

    setSaved(false);
    setError('');

    setPendingExercise(
      null,
    );
  }, [
    pendingExercise,
    setPendingExercise,
  ]);

  // ─────────────────────────────────────────────
  // Preserve edit draft
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!initialized) {
      return;
    }

    setEditRoutineDraft({
      routineId: id,
      name,
      items,
    });
  }, [
    initialized,
    id,
    name,
    items,
    setEditRoutineDraft,
  ]);

  // ─────────────────────────────────────────────
  // Prevent scroll while actually dragging
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (
      draggingIndex ===
      null
    ) {
      return;
    }

    const preventTouchMove =
      (
        event: TouchEvent,
      ) => {
        event.preventDefault();
      };

    const previousUserSelect =
      document.body.style
        .userSelect;

    document.body.style.userSelect =
      'none';

    document.addEventListener(
      'touchmove',
      preventTouchMove,
      {
        passive: false,
      },
    );

    return () => {
      document.body.style.userSelect =
        previousUserSelect;

      document.removeEventListener(
        'touchmove',
        preventTouchMove,
      );
    };
  }, [draggingIndex]);

  // ─────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────

  const totalSets =
    items.reduce(
      (sum, item) =>
        sum +
        item.target_sets,
      0,
    );

  const supersetLabels =
    useMemo(() => {
      const groups =
        new Map<
          string,
          string
        >();

      items.forEach(
        (item) => {
          const group =
            item.superset_group;

          if (
            !group ||
            groups.has(group)
          ) {
            return;
          }

          groups.set(
            group,
            String.fromCharCode(
              65 +
                groups.size,
            ),
          );
        },
      );

      return groups;
    }, [items]);

  const activeItem =
    detailIndex !== null
      ? items[
          detailIndex
        ] ?? null
      : null;

  const menuItem =
    menuIndex !== null
      ? items[
          menuIndex
        ] ?? null
      : null;

  // ─────────────────────────────────────────────
  // Common handlers
  // ─────────────────────────────────────────────

  const markDirty = () => {
    setSaved(false);
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

    markDirty();
  };

  const changeExercise = (
    index: number,
  ) => {
    setEditRoutineDraft({
      routineId: id,
      name,
      items,
    });

    setDetailIndex(null);
    setMenuIndex(null);

    router.push(
      `/exercises/select?idx=${index}`,
    );
  };

  const addExercise = () => {
    const index =
      items.length;

    const next =
      normalizeItems([
        ...items,
        DEFAULT_ITEM(index),
      ]);

    setItems(next);

    setEditRoutineDraft({
      routineId: id,
      name,
      items: next,
    });

    markDirty();

    router.push(
      `/exercises/select?idx=${index}`,
    );
  };

  const removeItem = (
    index: number,
  ) => {
    if (
      items.length <= 1
    ) {
      setError(
        '루틴에는 최소 1개의 운동이 필요합니다.',
      );

      return;
    }

    setItems(
      (previous) =>
        normalizeItems(
          previous.filter(
            (
              _,
              itemIndex,
            ) =>
              itemIndex !==
              index,
          ),
        ),
    );

    setDetailIndex(null);
    setMenuIndex(null);

    markDirty();
  };

  // ─────────────────────────────────────────────
  // Drag helpers
  // ─────────────────────────────────────────────

  const clearLongPressTimer =
    () => {
      if (
        longPressTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          longPressTimerRef.current,
        );

        longPressTimerRef.current =
          null;
      }
    };

  const captureCardMetrics =
    (): Array<
      CardMetric | null
    > =>
      cardRefs.current.map(
        (element) => {
          if (!element) {
            return null;
          }

          const rect =
            element.getBoundingClientRect();

          return {
            top: rect.top,

            bottom:
              rect.bottom,

            center:
              rect.top +
              rect.height / 2,

            height:
              rect.height,
          };
        },
      );

  const resetDragState =
    () => {
      clearLongPressTimer();

      setDraggingIndex(
        null,
      );

      setDragOffsetY(0);

      setInsertionIndex(
        null,
      );

      setSupersetTargetIndex(
        null,
      );

      dragStateRef.current =
        createEmptyDragRuntime();
    };

  const updateDragPreview =
    (
      clientX: number,
      clientY: number,
      sourceIndex: number,
    ) => {
      const state =
        dragStateRef.current;

      const sourceMetric =
        state.metrics[
          sourceIndex
        ];

      if (!sourceMetric) {
        return;
      }

      const scrollDelta =
        window.scrollY -
        state.startScrollY;

      const pointerDeltaY =
        clientY -
        state.startY;

      // source 카드 자체는 scroll만큼 추가 보정해서
      // 손가락 아래에 계속 붙어 있게 한다.
      setDragOffsetY(
        pointerDeltaY +
          scrollDelta,
      );

      // 드래그 카드의 화면상 중심.
      // transform에 scroll 보정을 넣으므로
      // 초기 center + pointer 이동량으로 계산 가능.
      const draggedCenterY =
        sourceMetric.center +
        pointerDeltaY;

      let nextSupersetTarget:
        | number
        | null = null;

      let bestSupersetDistance =
        Number.POSITIVE_INFINITY;

      // ─────────────────────────────────────────
      // Superset target detection
      //
      // 다른 카드의 중앙 영역에 충분히 포개면
      // 순서 이동 대신 슈퍼세트 후보가 된다.
      // ─────────────────────────────────────────

      state.metrics.forEach(
        (
          metric,
          index,
        ) => {
          if (
            !metric ||
            index ===
              sourceIndex
          ) {
            return;
          }

          const element =
            cardRefs.current[
              index
            ];

          if (!element) {
            return;
          }

          const rect =
            element.getBoundingClientRect();

          const adjustedTop =
            metric.top -
            scrollDelta;

          const adjustedBottom =
            metric.bottom -
            scrollDelta;

          const middleTop =
            adjustedTop +
            metric.height *
              0.31;

          const middleBottom =
            adjustedBottom -
            metric.height *
              0.31;

          const horizontalInside =
            clientX >=
              rect.left +
                rect.width *
                  0.12 &&
            clientX <=
              rect.right -
                rect.width *
                  0.12;

          if (
            horizontalInside &&
            draggedCenterY >=
              middleTop &&
            draggedCenterY <=
              middleBottom
          ) {
            const targetCenter =
              (
                adjustedTop +
                adjustedBottom
              ) / 2;

            const distance =
              Math.abs(
                draggedCenterY -
                  targetCenter,
              );

            if (
              distance <
              bestSupersetDistance
            ) {
              bestSupersetDistance =
                distance;

              nextSupersetTarget =
                index;
            }
          }
        },
      );

      if (
        nextSupersetTarget !==
        null
      ) {
        state.supersetTarget =
          nextSupersetTarget;

        state.insertionIndex =
          null;

        setSupersetTargetIndex(
          nextSupersetTarget,
        );

        setInsertionIndex(
          null,
        );

        return;
      }

      // ─────────────────────────────────────────
      // Normal reorder target
      //
      // source를 뺀 목록에서 어느 위치에
      // 들어갈지 계산한다.
      // ─────────────────────────────────────────

      const remainingIndices =
        items
          .map(
            (
              _,
              index,
            ) => index,
          )
          .filter(
            (index) =>
              index !==
              sourceIndex,
          );

      let nextInsertion =
        remainingIndices.length;

      for (
        let position = 0;
        position <
        remainingIndices.length;
        position += 1
      ) {
        const index =
          remainingIndices[
            position
          ];

        const metric =
          state.metrics[
            index
          ];

        if (!metric) {
          continue;
        }

        const adjustedCenter =
          metric.center -
          scrollDelta;

        if (
          draggedCenterY <
          adjustedCenter
        ) {
          nextInsertion =
            position;

          break;
        }
      }

      state.supersetTarget =
        null;

      state.insertionIndex =
        nextInsertion;

      setSupersetTargetIndex(
        null,
      );

      setInsertionIndex(
        nextInsertion,
      );
    };

  // ─────────────────────────────────────────────
  // Preview movement
  //
  // Galaxy 홈 화면처럼 주변 카드가 먼저
  // 자리를 비켜주어 실제 삽입 위치를 보여준다.
  // ─────────────────────────────────────────────

  const getPreviewShift = (
    index: number,
  ) => {
    if (
      draggingIndex ===
        null ||
      insertionIndex ===
        null ||
      supersetTargetIndex !==
        null ||
      index ===
        draggingIndex
    ) {
      return 0;
    }

    const source =
      draggingIndex;

    const remaining =
      items
        .map(
          (
            _,
            itemIndex,
          ) =>
            itemIndex,
        )
        .filter(
          (itemIndex) =>
            itemIndex !==
            source,
        );

    const targetPosition =
      Math.max(
        0,
        Math.min(
          insertionIndex,
          remaining.length,
        ),
      );

    const currentPosition =
      remaining.indexOf(
        index,
      );

    if (
      currentPosition === -1
    ) {
      return 0;
    }

    const sourceHeight =
      dragStateRef.current
        .metrics[
          source
        ]?.height ??
      78;

    const slotHeight =
      sourceHeight +
      CARD_GAP_PX;

    // 위로 이동:
    // target부터 기존 source 앞까지
    // 한 칸씩 아래로 밀린다.
    if (
      targetPosition <
      source
    ) {
      if (
        currentPosition >=
          targetPosition &&
        currentPosition <
          source
      ) {
        return slotHeight;
      }

      return 0;
    }

    // 아래로 이동:
    // 기존 source 뒤부터 target 앞까지
    // 한 칸씩 위로 밀린다.
    if (
      targetPosition >
      source
    ) {
      if (
        currentPosition >=
          source &&
        currentPosition <
          targetPosition
      ) {
        return -slotHeight;
      }
    }

    return 0;
  };

  // ─────────────────────────────────────────────
  // Apply drag result
  // ─────────────────────────────────────────────

  const applyDragResult =
    () => {
      const state =
        dragStateRef.current;

      const sourceIndex =
        state.sourceIndex;

      if (
        sourceIndex ===
        null
      ) {
        return;
      }

      const supersetTarget =
        state.supersetTarget;

      const nextInsertion =
        state.insertionIndex;

      setItems(
        (previous) => {
          const original =
            normalizeItems(
              previous,
            );

          const dragged =
            original[
              sourceIndex
            ];

          if (!dragged) {
            return original;
          }

          let remaining =
            original
              .filter(
                (
                  _,
                  index,
                ) =>
                  index !==
                  sourceIndex,
              )
              .map(
                (item) => ({
                  ...item,
                }),
              );

          // 드래그한 운동이 기존 슈퍼세트 소속이면
          // 우선 그룹에서 떼어낸다.
          const draggedDetached: DraftItem =
            {
              ...dragged,

              superset_group:
                null,
            };

          // 나머지 그룹 중 1개만 남은 그룹은 자동 해제.
          remaining =
            normalizeItems(
              remaining,
            );

          // ─────────────────────────────────────
          // Superset drop
          //
          // target 운동이 항상 첫 번째,
          // 지금 이동한 운동이 항상 두 번째.
          // ─────────────────────────────────────

          if (
            supersetTarget !==
            null
          ) {
            let adjustedTarget =
              supersetTarget;

            if (
              supersetTarget >
              sourceIndex
            ) {
              adjustedTarget -= 1;
            }

            const target =
              remaining[
                adjustedTarget
              ];

            if (!target) {
              return original;
            }

            // 대상이 이미 다른 슈퍼세트라면
            // 기존 묶음을 먼저 해제하고
            // target + dragged 새 쌍을 만든다.
            const existingGroup =
              target.superset_group ??
              null;

            if (
              existingGroup
            ) {
              remaining =
                remaining.map(
                  (item) =>
                    item.superset_group ===
                    existingGroup
                      ? {
                          ...item,

                          superset_group:
                            null,
                        }
                      : item,
                );
            }

            const newGroup =
              `superset-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;

            remaining[
              adjustedTarget
            ] = {
              ...remaining[
                adjustedTarget
              ],

              superset_group:
                newGroup,
            };

            remaining.splice(
              adjustedTarget +
                1,
              0,
              {
                ...draggedDetached,

                superset_group:
                  newGroup,
              },
            );

            return normalizeItems(
              remaining,
            );
          }

          // ─────────────────────────────────────
          // Normal reorder
          // ─────────────────────────────────────

          if (
            nextInsertion ===
            null
          ) {
            return original;
          }

          let safeInsertion =
            Math.max(
              0,
              Math.min(
                nextInsertion,
                remaining.length,
              ),
            );

          // 기존 슈퍼세트 두 운동 사이에
          // 일반 운동이 끼어들지 않도록 보정.
          if (
            safeInsertion >
              0 &&
            safeInsertion <
              remaining.length
          ) {
            const before =
              remaining[
                safeInsertion -
                  1
              ];

            const after =
              remaining[
                safeInsertion
              ];

            if (
              before
                ?.superset_group &&
              before.superset_group ===
                after
                  ?.superset_group
            ) {
              const beforeMetric =
                state.metrics[
                  original.indexOf(
                    before,
                  )
                ];

              const afterMetric =
                state.metrics[
                  original.indexOf(
                    after,
                  )
                ];

              if (
                beforeMetric &&
                afterMetric
              ) {
                const groupCenter =
                  (
                    beforeMetric.center +
                    afterMetric.center
                  ) / 2;

                const draggedCenter =
                  (
                    state.metrics[
                      sourceIndex
                    ]?.center ??
                    groupCenter
                  ) +
                  (
                    dragStateRef.current
                      .startY
                      ? 0
                      : 0
                  );

                if (
                  draggedCenter <
                  groupCenter
                ) {
                  safeInsertion -= 1;
                } else {
                  safeInsertion += 1;
                }
              } else {
                safeInsertion += 1;
              }
            }
          }

          remaining.splice(
            safeInsertion,
            0,
            draggedDetached,
          );

          return normalizeItems(
            remaining,
          );
        },
      );

      markDirty();
    };

  // ─────────────────────────────────────────────
  // Pointer handlers
  // ─────────────────────────────────────────────

  const handlePointerDown =
    (
      index: number,
      event:
        ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (isSaving) {
        return;
      }

      if (
        event.pointerType ===
          'mouse' &&
        event.button !== 0
      ) {
        return;
      }

      clearLongPressTimer();

      dragStateRef.current =
        {
          sourceIndex:
            index,

          pointerId:
            event.pointerId,

          startX:
            event.clientX,

          startY:
            event.clientY,

          dragging:
            false,

          moved:
            false,

          insertionIndex:
            null,

          supersetTarget:
            null,

          startScrollY:
            window.scrollY,

          metrics:
            [],
        };

      try {
        event.currentTarget.setPointerCapture(
          event.pointerId,
        );
      } catch {
        // Pointer capture unsupported.
      }

      longPressTimerRef.current =
        window.setTimeout(
          () => {
            const state =
              dragStateRef.current;

            if (
              state.sourceIndex !==
              index
            ) {
              return;
            }

            state.dragging =
              true;

            state.metrics =
              captureCardMetrics();

            state.startScrollY =
              window.scrollY;

            suppressClickRef.current =
              true;

            setDraggingIndex(
              index,
            );

            setDetailIndex(
              null,
            );

            setMenuIndex(
              null,
            );

            setDragOffsetY(
              0,
            );

            setInsertionIndex(
              index,
            );

            setSupersetTargetIndex(
              null,
            );

            state.insertionIndex =
              index;

            if (
              typeof navigator !==
                'undefined' &&
              typeof navigator.vibrate ===
                'function'
            ) {
              navigator.vibrate(
                18,
              );
            }
          },
          LONG_PRESS_MS,
        );
    };

  const handlePointerMove =
    (
      event:
        ReactPointerEvent<HTMLButtonElement>,
    ) => {
      const state =
        dragStateRef.current;

      if (
        state.sourceIndex ===
          null ||
        state.pointerId !==
          event.pointerId
      ) {
        return;
      }

      const deltaX =
        event.clientX -
        state.startX;

      const deltaY =
        event.clientY -
        state.startY;

      const distance =
        Math.sqrt(
          deltaX *
            deltaX +
            deltaY *
              deltaY,
        );

      // Long press 이전에 손가락을 크게 움직였으면
      // 일반 스크롤로 판단.
      if (!state.dragging) {
        if (
          distance >
          DRAG_MOVE_THRESHOLD
        ) {
          clearLongPressTimer();
        }

        return;
      }

      event.preventDefault();

      state.moved =
        distance >
        DRAG_MOVE_THRESHOLD;

      updateDragPreview(
        event.clientX,
        event.clientY,
        state.sourceIndex,
      );

      // 화면 가장자리 자동 스크롤
      const edgeSize = 90;

      if (
        event.clientY <
        edgeSize
      ) {
        window.scrollBy({
          top: -9,
          behavior: 'auto',
        });
      } else if (
        event.clientY >
        window.innerHeight -
          edgeSize
      ) {
        window.scrollBy({
          top: 9,
          behavior: 'auto',
        });
      }
    };

  const handlePointerUp =
    (
      event:
        ReactPointerEvent<HTMLButtonElement>,
    ) => {
      const state =
        dragStateRef.current;

      clearLongPressTimer();

      if (
        state.pointerId !==
        event.pointerId
      ) {
        return;
      }

      if (
        state.dragging
      ) {
        event.preventDefault();

        if (
          state.sourceIndex !==
          null
        ) {
          updateDragPreview(
            event.clientX,
            event.clientY,
            state.sourceIndex,
          );
        }

        if (
          state.moved
        ) {
          applyDragResult();
        }

        suppressClickRef.current =
          true;

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

      resetDragState();
    };

  const handlePointerCancel =
    () => {
      resetDragState();

      window.setTimeout(
        () => {
          suppressClickRef.current =
            false;
        },
        80,
      );
    };

  // ─────────────────────────────────────────────
  // Save
  // ─────────────────────────────────────────────

  const handleSave =
    async (
      showSavedState = true,
    ): Promise<boolean> => {
      if (isSaving) {
        return false;
      }

      if (!name.trim()) {
        setError(
          '루틴 이름을 입력해주세요.',
        );

        return false;
      }

      if (
        items.length === 0 ||
        items.some(
          (item) =>
            !item.exercise_name.trim(),
        )
      ) {
        setError(
          '모든 운동을 선택해주세요.',
        );

        return false;
      }

      const normalized =
        normalizeItems(
          items,
        );

      setError('');
      setIsSaving(true);

      try {
        const success =
          await updateRoutine(
            id,
            name.trim(),
            normalized,
          );

        if (!success) {
          setError(
            '루틴 저장에 실패했습니다. 다시 시도해주세요.',
          );

          return false;
        }

        clearEditRoutineDraft();

        if (
          showSavedState
        ) {
          setSaved(true);

          window.setTimeout(
            () => {
              setSaved(false);
            },
            1500,
          );
        }

        return true;
      } finally {
        setIsSaving(false);
      }
    };

  const handleStart =
    async () => {
      const success =
        await handleSave(
          false,
        );

      if (!success) {
        return;
      }

      startWorkout(id);

      router.push(
        `/routines/${id}/workout`,
      );
    };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  if (!user) {
    return null;
  }

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-600">
          루틴을 불러오는 중...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-32 text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-zinc-950/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 pb-4 pt-10">
          <button
            type="button"
            onClick={() =>
              router.back()
            }
            disabled={
              isSaving ||
              draggingIndex !==
                null
            }
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors active:bg-zinc-900 disabled:opacity-40"
            aria-label="뒤로 가기"
          >
            <ChevronLeft
              size={23}
            />
          </button>

          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={name}
              onChange={(
                event,
              ) => {
                setName(
                  event.target.value,
                );

                markDirty();
              }}
              disabled={
                isSaving ||
                draggingIndex !==
                  null
              }
              placeholder="루틴 이름"
              className="w-full truncate bg-transparent text-lg font-bold text-white outline-none placeholder:text-zinc-600"
            />

            <p className="mt-0.5 text-[11px] text-zinc-600">
              {items.length}개 운동
              {' · '}
              {totalSets}세트
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={
              isSaving ||
              draggingIndex !==
                null
            }
            className={`flex h-9 min-w-[58px] items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold transition-colors ${
              saved
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-zinc-900 text-zinc-300 active:bg-zinc-800'
            } disabled:opacity-40`}
          >
            {saved ? (
              <>
                <Check
                  size={14}
                />

                완료
              </>
            ) : isSaving ? (
              '저장 중'
            ) : (
              '저장'
            )}
          </button>
        </div>
      </header>

      <main className="px-4 pt-5">
        <section className="mb-4 px-1">
          <h1 className="text-xl font-bold tracking-tight">
            운동 구성
          </h1>

          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            운동을 누르면 세부 설정을 변경할 수 있습니다.
            길게 누른 뒤 움직이면 순서를 변경하거나 슈퍼세트로 묶을 수 있습니다.
          </p>
        </section>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Exercise list */}
        <section className="relative space-y-2">
          {items.map(
            (
              item,
              index,
            ) => {
              const groupLabel =
                item.superset_group
                  ? supersetLabels.get(
                      item.superset_group,
                    )
                  : null;

              const isDragging =
                draggingIndex ===
                index;

              const previewShift =
                getPreviewShift(
                  index,
                );

              const isSupersetTarget =
                supersetTargetIndex ===
                index;

              return (
                <article
                  key={`${item.exercise_name}-${index}`}
                  ref={(element) => {
                    cardRefs.current[
                      index
                    ] =
                      element;
                  }}
                  style={
                    isDragging
                      ? {
                          transform: `translateY(${dragOffsetY}px) scale(1.035)`,
                          zIndex: 60,

                          transition:
                            'none',
                        }
                      : {
                          transform: `translateY(${previewShift}px)`,

                          transition:
                            draggingIndex !==
                            null
                              ? 'transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                              : 'none',
                        }
                  }
                  className={`relative overflow-visible rounded-2xl border ${
                    isDragging
                      ? 'border-blue-500/60 bg-zinc-900 shadow-2xl shadow-black/70 ring-1 ring-blue-500/20'
                      : isSupersetTarget
                        ? 'border-blue-400 bg-blue-500/[0.14] ring-2 ring-blue-500/35'
                        : groupLabel
                          ? 'border-blue-500/25 bg-blue-500/[0.045]'
                          : 'border-zinc-900 bg-zinc-900/45'
                  }`}
                >
                  {isSupersetTarget && (
                    <div className="pointer-events-none absolute -top-3 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-500 px-3 py-1 text-[10px] font-bold text-white shadow-lg shadow-blue-950/50">
                      놓으면 슈퍼세트
                    </div>
                  )}

                  <div className="flex min-h-[78px] items-center overflow-hidden rounded-2xl">
                    <button
                      type="button"
                      onPointerDown={(
                        event,
                      ) =>
                        handlePointerDown(
                          index,
                          event,
                        )
                      }
                      onPointerMove={
                        handlePointerMove
                      }
                      onPointerUp={
                        handlePointerUp
                      }
                      onPointerCancel={
                        handlePointerCancel
                      }
                      onContextMenu={(
                        event,
                      ) =>
                        event.preventDefault()
                      }
                      onClick={() => {
                        if (
                          suppressClickRef.current
                        ) {
                          return;
                        }

                        if (
                          draggingIndex !==
                          null
                        ) {
                          return;
                        }

                        if (
                          !item.exercise_name
                        ) {
                          changeExercise(
                            index,
                          );

                          return;
                        }

                        setDetailIndex(
                          index,
                        );
                      }}
                      className="flex min-w-0 flex-1 select-none items-center gap-3 px-3 py-3 text-left"
                    >
                      <div
                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold transition-colors ${
                          groupLabel
                            ? 'bg-blue-500/15 text-blue-400'
                            : isDragging
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p
                            className={`truncate text-[15px] font-semibold ${
                              item.exercise_name
                                ? 'text-zinc-100'
                                : 'text-zinc-600'
                            }`}
                          >
                            {item.exercise_name ||
                              '운동을 선택해주세요'}
                          </p>

                          {groupLabel && (
                            <span className="flex-shrink-0 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">
                              SUPER{' '}
                              {
                                groupLabel
                              }
                            </span>
                          )}
                        </div>

                        {item.exercise_name && (
                          <p className="mt-1 truncate text-[11px] text-zinc-600">
                            {exerciseSummary(
                              item,
                            )}
                          </p>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          draggingIndex !==
                          null
                        ) {
                          return;
                        }

                        setMenuIndex(
                          index,
                        );
                      }}
                      disabled={
                        draggingIndex !==
                        null
                      }
                      className="mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-zinc-600 transition-colors active:bg-zinc-800 active:text-zinc-300 disabled:opacity-30"
                      aria-label={`${item.exercise_name || '운동'} 메뉴`}
                    >
                      <MoreHorizontal
                        size={20}
                      />
                    </button>
                  </div>
                </article>
              );
            },
          )}
        </section>

        {items.length ===
          0 && (
          <div className="rounded-3xl border border-dashed border-zinc-800 px-5 py-14 text-center">
            <p className="text-sm font-medium text-zinc-500">
              아직 운동이 없습니다.
            </p>

            <p className="mt-1 text-xs text-zinc-700">
              아래 운동 추가 버튼을 눌러주세요.
            </p>
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-zinc-900/35 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-zinc-600">
            길게 누른 운동을 위아래로 옮기면 주변 운동이 자리를 비켜줍니다.
            운동 사이에 놓으면 순서가 바뀌고, 다른 운동 중앙에 포개면 슈퍼세트가 만들어집니다.
          </p>
        </div>
      </main>

      {/* Drag helper */}
      {draggingIndex !==
        null && (
        <div className="pointer-events-none fixed bottom-[94px] left-1/2 z-[65] -translate-x-1/2 px-3">
          <div className="whitespace-nowrap rounded-full border border-blue-500/20 bg-zinc-900/95 px-4 py-2 text-[11px] font-semibold text-zinc-300 shadow-xl backdrop-blur-xl">
            {supersetTargetIndex !==
            null
              ? '여기서 놓으면 슈퍼세트'
              : '주변 운동이 움직인 빈 자리에 놓으면 순서 변경'}
          </div>
        </div>
      )}

      {/* Fixed actions */}
      <footer
        className={`fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-white/[0.06] bg-zinc-950/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl transition-opacity ${
          draggingIndex !==
          null
            ? 'pointer-events-none opacity-20'
            : ''
        }`}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              void handleStart();
            }}
            disabled={
              isSaving ||
              items.length ===
                0 ||
              items.some(
                (item) =>
                  !item.exercise_name,
              )
            }
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-bold text-white transition-colors active:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            <Play
              size={18}
              fill="currentColor"
            />

            운동 시작
          </button>

          <button
            type="button"
            onClick={
              addExercise
            }
            disabled={
              isSaving
            }
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-zinc-950 transition-colors active:bg-zinc-200 disabled:opacity-50"
          >
            <Plus
              size={20}
            />

            운동 추가
          </button>
        </div>
      </footer>

      {/* Exercise detail sheet */}
      {detailIndex !==
        null &&
        activeItem && (
          <div
            className="fixed inset-0 z-[70] flex items-end bg-black/70 backdrop-blur-sm"
            onClick={() =>
              setDetailIndex(
                null,
              )
            }
          >
            <div
              className="mx-auto w-full max-w-md rounded-t-[28px] border-t border-zinc-800 bg-zinc-950 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4"
              onClick={(
                event,
              ) =>
                event.stopPropagation()
              }
            >
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-700" />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    운동 설정
                  </p>

                  <h2 className="mt-1 truncate text-xl font-bold">
                    {
                      activeItem.exercise_name
                    }
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setDetailIndex(
                      null,
                    )
                  }
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-500"
                  aria-label="닫기"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold text-zinc-500">
                  기록 방식
                </p>

                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-900 p-1">
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
                        activeItem.record_type ===
                        recordType;

                      return (
                        <button
                          key={
                            recordType
                          }
                          type="button"
                          onClick={() =>
                            updateItem(
                              detailIndex,
                              'record_type',
                              recordType,
                            )
                          }
                          className={`rounded-xl px-2 py-2.5 text-[11px] font-semibold transition-colors ${
                            active
                              ? 'bg-zinc-700 text-white'
                              : 'text-zinc-600'
                          }`}
                        >
                          {recordTypeLabel(
                            recordType,
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <TargetControl
                  label="세트"
                  displayValue={`${activeItem.target_sets}`}
                  onDecrease={() =>
                    updateItem(
                      detailIndex,
                      'target_sets',
                      Math.max(
                        1,
                        activeItem.target_sets -
                          1,
                      ),
                    )
                  }
                  onIncrease={() =>
                    updateItem(
                      detailIndex,
                      'target_sets',
                      activeItem.target_sets +
                        1,
                    )
                  }
                />

                <TargetControl
                  label={
                    activeItem.record_type ===
                    'time'
                      ? '목표 시간'
                      : '목표 횟수'
                  }
                  displayValue={
                    activeItem.record_type ===
                    'time'
                      ? formatDuration(
                          activeItem.target_reps,
                        )
                      : `${activeItem.target_reps}회`
                  }
                  onDecrease={() =>
                    updateItem(
                      detailIndex,
                      'target_reps',
                      Math.max(
                        1,
                        activeItem.target_reps -
                          (
                            activeItem.record_type ===
                            'time'
                              ? 15
                              : 1
                          ),
                      ),
                    )
                  }
                  onIncrease={() =>
                    updateItem(
                      detailIndex,
                      'target_reps',
                      activeItem.target_reps +
                        (
                          activeItem.record_type ===
                          'time'
                            ? 15
                            : 1
                        ),
                    )
                  }
                />

                <TargetControl
                  label="휴식"
                  displayValue={formatDuration(
                    activeItem.rest_seconds,
                  )}
                  onDecrease={() =>
                    updateItem(
                      detailIndex,
                      'rest_seconds',
                      Math.max(
                        0,
                        activeItem.rest_seconds -
                          15,
                      ),
                    )
                  }
                  onIncrease={() =>
                    updateItem(
                      detailIndex,
                      'rest_seconds',
                      activeItem.rest_seconds +
                        15,
                    )
                  }
                />
              </div>

              <p className="mt-5 rounded-2xl bg-zinc-900/60 px-4 py-3 text-[11px] leading-relaxed text-zinc-600">
                실제 수행 무게와 횟수는 운동 중에도 세트별로 바로 조절할 수 있습니다.
              </p>

              <button
                type="button"
                onClick={() =>
                  setDetailIndex(
                    null,
                  )
                }
                className="mt-4 flex w-full items-center justify-center rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition-colors active:bg-blue-500"
              >
                설정 완료
              </button>
            </div>
          </div>
        )}

      {/* More menu */}
      {menuIndex !==
        null &&
        menuItem && (
          <div
            className="fixed inset-0 z-[80] flex items-end bg-black/70 backdrop-blur-sm"
            onClick={() =>
              setMenuIndex(
                null,
              )
            }
          >
            <div
              className="mx-auto w-full max-w-md rounded-t-[28px] border-t border-zinc-800 bg-zinc-950 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4"
              onClick={(
                event,
              ) =>
                event.stopPropagation()
              }
            >
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-700" />

              <div className="mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  운동 메뉴
                </p>

                <h2 className="mt-1 truncate text-lg font-bold">
                  {menuItem.exercise_name ||
                    '운동'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  changeExercise(
                    menuIndex,
                  )
                }
                className="flex w-full items-center justify-center rounded-2xl bg-zinc-900 py-3.5 text-sm font-semibold text-zinc-200 transition-colors active:bg-zinc-800"
              >
                다른 운동으로 변경
              </button>

              <button
                type="button"
                disabled={
                  items.length <=
                  1
                }
                onClick={() =>
                  removeItem(
                    menuIndex,
                  )
                }
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 py-3.5 text-sm font-semibold text-red-400 transition-colors active:bg-red-500/20 disabled:opacity-30"
              >
                <Trash2
                  size={16}
                />

                운동 삭제
              </button>

              <button
                type="button"
                onClick={() =>
                  setMenuIndex(
                    null,
                  )
                }
                className="mt-2 flex h-11 w-full items-center justify-center text-sm text-zinc-600"
              >
                취소
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function TargetControl({
  label,
  displayValue,
  onDecrease,
  onIncrease,
}: {
  label: string;
  displayValue: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div>
      <p className="mb-2 text-center text-[10px] font-medium text-zinc-600">
        {label}
      </p>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex min-h-12 items-center justify-center px-1">
          <span className="text-sm font-bold tabular-nums text-white">
            {displayValue}
          </span>
        </div>

        <div className="grid grid-cols-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={
              onDecrease
            }
            className="py-2.5 text-base text-zinc-500 transition-colors active:bg-zinc-800 active:text-white"
          >
            −
          </button>

          <button
            type="button"
            onClick={
              onIncrease
            }
            className="border-l border-zinc-800 py-2.5 text-base text-zinc-500 transition-colors active:bg-zinc-800 active:text-white"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}