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
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';

import AppShell from '@/components/AppShell';

import {
  useStore,
} from '@/lib/store';

import {
  createClient,
} from '@/lib/supabase/client';

import type {
  MealLog,
  MealType,
} from '@/lib/types';


const MEAL_TYPES: MealType[] = [
  '아침',
  '점심',
  '저녁',
  '간식',
];


function todayKey() {
  return new Date().toLocaleDateString(
    'en-CA',
  );
}


function offsetDate(
  base: string,
  days: number,
) {
  const date =
    new Date(
      `${base}T00:00:00`,
    );

  date.setDate(
    date.getDate() +
      days,
  );

  return date.toLocaleDateString(
    'en-CA',
  );
}


function formatDateLabel(
  dateKey: string,
) {
  const today =
    todayKey();

  const yesterday =
    offsetDate(
      today,
      -1,
    );

  if (
    dateKey === today
  ) {
    return '오늘';
  }

  if (
    dateKey === yesterday
  ) {
    return '어제';
  }

  const [
    year,
    month,
    day,
  ] =
    dateKey.split('-');

  return `${year}년 ${parseInt(
    month,
  )}월 ${parseInt(
    day,
  )}일`;
}


function suggestedMealType(): MealType {
  const hour =
    new Date().getHours();

  if (hour < 10) {
    return '아침';
  }

  if (hour < 15) {
    return '점심';
  }

  if (hour < 21) {
    return '저녁';
  }

  return '간식';
}


export default function MealsPage() {
  const router =
    useRouter();

  const {
    currentUser,
    users,

    mealLogs,
    setMealLogs,

    getMealsByDate,
    getDailyNutrition,

    removeMealItem,
  } = useStore();

  const [
    date,
    setDate,
  ] =
    useState(
      todayKey(),
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    loadError,
    setLoadError,
  ] =
    useState('');

  const [
    actionError,
    setActionError,
  ] =
    useState('');

  const [
    reloadKey,
    setReloadKey,
  ] =
    useState(0);

  const [
    deletingItemId,
    setDeletingItemId,
  ] =
    useState<
      string | null
    >(null);

  const user =
    currentUser();

  const storedUser =
    user
      ? users.find(
          (item) =>
            item.id ===
            user.id,
        )
      : null;

  const isGuest =
    Boolean(
      storedUser?.is_guest,
    );

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
  // Supabase Meal Load
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled =
      false;

    if (isGuest) {
      setIsLoading(
        false,
      );

      setLoadError(
        '',
      );

      return;
    }

    const userId =
      user.id;

    const loadMeals =
      async () => {
        setIsLoading(
          true,
        );

        setLoadError(
          '',
        );

        try {
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

          const {
            data,
            error,
          } =
            await supabase
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
              );

          if (error) {
            throw new Error(
              error.message,
            );
          }

          if (cancelled) {
            return;
          }

          const loadedLogs:
            MealLog[] =
              (
                data ?? []
              ).map(
                (log) => ({
                  id:
                    log.id,

                  user_id:
                    log.user_id,

                  date:
                    log.date,

                  meal_type:
                    log.meal_type as
                      MealType,

                  items: (
                    log.meal_items ??
                    []
                  ).map(
                    (item) => ({
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

          /*
           * 다른 로컬 사용자 / Guest 데이터는 유지하고
           * 현재 로그인 사용자의 식단만 Supabase 값으로 교체.
           */
          const currentLogs =
            useStore.getState()
              .mealLogs;

          setMealLogs([
            ...currentLogs.filter(
              (log) =>
                log.user_id !==
                userId,
            ),

            ...loadedLogs,
          ]);
        } catch (error) {
          console.error(
            'Meal load failed:',
            error,
          );

          if (!cancelled) {
            setLoadError(
              '최신 식단 기록을 불러오지 못했어요.',
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

    void loadMeals();

    return () => {
      cancelled =
        true;
    };
  }, [
    user?.id,
    isGuest,
    reloadKey,
    setMealLogs,
  ]);

  if (!user) {
    return null;
  }

  // ─────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────

  const meals =
    getMealsByDate(
      date,
    );

  const nutrition =
    getDailyNutrition(
      date,
    );

  const isToday =
    date ===
    todayKey();

  const mealsByType =
    MEAL_TYPES.map(
      (type) => ({
        type,

        log:
          meals.find(
            (meal) =>
              meal.meal_type ===
              type,
          ) ?? null,
      }),
    );

  const recordedMealCount =
    mealsByType.filter(
      ({
        log,
      }) =>
        Boolean(
          log &&
            log.items.length >
              0,
        ),
    ).length;

  const recordPercent =
    Math.round(
      (
        recordedMealCount /
        MEAL_TYPES.length
      ) *
        100,
    );

  const totalFoodCount =
    meals.reduce(
      (
        count,
        log,
      ) =>
        count +
        log.items.length,
      0,
    );

  const suggestedType =
    isToday
      ? suggestedMealType()
      : '점심';

  // ─────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────

  const handleDelete =
    async (
      log: MealLog,
      itemId: string,
    ) => {
      if (
        deletingItemId
      ) {
        return;
      }

      setActionError(
        '',
      );

      if (isGuest) {
        removeMealItem(
          log.id,
          itemId,
        );

        return;
      }

      setDeletingItemId(
        itemId,
      );

      try {
        const supabase =
          createClient();

        const {
          error,
        } =
          await supabase
            .from(
              'meal_items',
            )
            .delete()
            .eq(
              'id',
              itemId,
            );

        if (error) {
          console.error(
            'Meal item delete failed:',
            error.message,
          );

          setActionError(
            '음식 기록을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.',
          );

          return;
        }

        /*
         * 마지막 item이었다면 빈 부모 log도 정리.
         */
        if (
          log.items.length ===
          1
        ) {
          const {
            error:
              logDeleteError,
          } =
            await supabase
              .from(
                'meal_logs',
              )
              .delete()
              .eq(
                'id',
                log.id,
              )
              .eq(
                'user_id',
                user.id,
              );

          if (
            logDeleteError
          ) {
            console.error(
              'Empty meal log delete failed:',
              logDeleteError.message,
            );
          }
        }

        removeMealItem(
          log.id,
          itemId,
        );
      } catch (error) {
        console.error(
          'Meal delete failed:',
          error,
        );

        setActionError(
          '음식 기록을 삭제하는 중 문제가 발생했어요.',
        );
      } finally {
        setDeletingItemId(
          null,
        );
      }
    };

  return (
    <AppShell>
      {/* Header */}
      <header className="px-5 pt-10 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
            Nutrition
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            식단
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            오늘 먹은 음식과 영양을 한눈에 기록하세요.
          </p>
        </div>
      </header>

      {/* Date */}
      <section className="px-5 mb-5">
        <div className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-2 py-2">
          <button
            type="button"
            onClick={() =>
              setDate(
                (current) =>
                  offsetDate(
                    current,
                    -1,
                  ),
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="이전 날짜"
          >
            <ChevronLeft
              size={19}
            />
          </button>

          <div className="text-center">
            <p className="text-sm font-semibold">
              {formatDateLabel(
                date,
              )}
            </p>

            {!isToday && (
              <button
                type="button"
                onClick={() =>
                  setDate(
                    todayKey(),
                  )
                }
                className="mt-0.5 text-[10px] font-medium text-blue-400"
              >
                오늘로 이동
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={
              isToday
            }
            onClick={() =>
              setDate(
                (current) =>
                  offsetDate(
                    current,
                    1,
                  ),
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-20"
            aria-label="다음 날짜"
          >
            <ChevronRight
              size={19}
            />
          </button>
        </div>
      </section>

      {/* Loading */}
      {isLoading && (
        <section className="px-5 mb-5">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />

              <p className="text-xs text-zinc-500">
                최신 식단 기록을 불러오고 있어요
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Load error */}
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
                  식단을 불러오지 못했어요
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

      {/* Action error */}
      {actionError && (
        <section className="px-5 mb-5">
          <div className="flex items-start gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
            <AlertCircle
              size={16}
              className="mt-0.5 flex-shrink-0 text-rose-400"
            />

            <p className="text-xs leading-relaxed text-rose-200/70">
              {actionError}
            </p>
          </div>
        </section>
      )}

      {/* Daily summary */}
      <section className="px-5 mb-7">
        <div className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-zinc-500">
                {formatDateLabel(
                  date,
                )}{' '}
                섭취
              </p>

              <p className="mt-1 text-3xl font-bold">
                {Math.round(
                  nutrition.kcal,
                )}

                <span className="ml-1 text-sm font-medium text-zinc-500">
                  kcal
                </span>
              </p>

              <p className="mt-2 text-xs text-zinc-600">
                음식 {totalFoodCount}개 기록
              </p>
            </div>

            <div className="rounded-2xl bg-emerald-500/10 px-3 py-2.5 text-right">
              <p className="text-sm font-bold text-emerald-400">
                {recordedMealCount}/4
              </p>

              <p className="mt-0.5 text-[9px] text-emerald-400/60">
                끼니 기록
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-zinc-600">
                기록 진행도
              </p>

              <p className="text-[10px] font-medium text-zinc-500">
                {recordPercent}%
              </p>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{
                  width:
                    `${recordPercent}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 divide-x divide-zinc-800">
            <MacroMetric
              label="탄수화물"
              value={
                nutrition.carbs_g
              }
              className="text-amber-400"
            />

            <MacroMetric
              label="단백질"
              value={
                nutrition.protein_g
              }
              className="text-blue-400"
            />

            <MacroMetric
              label="지방"
              value={
                nutrition.fat_g
              }
              className="text-rose-400"
            />
          </div>

          <p className="mt-5 border-t border-zinc-800/70 pt-4 text-[10px] leading-relaxed text-zinc-600">
            영양 목표는 사용자마다 달라질 수 있어요. 이 화면은 우선 실제로 기록된 섭취량을 보여줍니다.
          </p>
        </div>
      </section>

      {/* Main add CTA */}
      <section className="px-5 mb-7">
        <Link
          href={`/meals/add?date=${date}&type=${encodeURIComponent(
            suggestedType,
          )}`}
          className="group flex items-center justify-between rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-4 transition-colors hover:bg-emerald-500/[0.08]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Camera
                size={20}
                className="text-emerald-400"
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold">
                  {isToday
                    ? `${suggestedType} 기록 추가`
                    : '음식 기록 추가'}
                </p>

                <Sparkles
                  size={12}
                  className="flex-shrink-0 text-blue-400"
                />
              </div>

              <p className="mt-1 truncate text-xs text-zinc-500">
                음식 DB 검색과 AI 영양 추정을 활용해 빠르게 기록하세요
              </p>
            </div>
          </div>

          <ChevronRight
            size={18}
            className="ml-3 flex-shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-500"
          />
        </Link>
      </section>

      {/* Meals */}
      <section className="px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            식사 기록
          </h2>

          <span className="text-[10px] text-zinc-600">
            아침 · 점심 · 저녁 · 간식
          </span>
        </div>

        <div className="space-y-3">
          {mealsByType.map(
            ({
              type,
              log,
            }) => {
              const hasItems =
                Boolean(
                  log &&
                    log.items.length >
                      0,
                );

              const typeKcal =
                log?.items.reduce(
                  (
                    sum,
                    item,
                  ) =>
                    sum +
                    item.kcal,
                  0,
                ) ?? 0;

              const typeProtein =
                log?.items.reduce(
                  (
                    sum,
                    item,
                  ) =>
                    sum +
                    item.protein_g,
                  0,
                ) ?? 0;

              return (
                <article
                  key={type}
                  className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60"
                >
                  {/* Meal header */}
                  <div className="flex items-center justify-between border-b border-zinc-800/70 px-4 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        {hasItems && (
                          <CheckCircle2
                            size={15}
                            className="text-emerald-400"
                          />
                        )}

                        <p className="text-sm font-semibold">
                          {type}
                        </p>
                      </div>

                      {hasItems ? (
                        <p className="mt-1 text-[10px] text-zinc-600">
                          {Math.round(
                            typeKcal,
                          )}{' '}
                          kcal
                          {' · '}
                          단백질{' '}
                          {roundOne(
                            typeProtein,
                          )}
                          g
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-zinc-700">
                          아직 기록 없음
                        </p>
                      )}
                    </div>

                    <Link
                      href={`/meals/add?date=${date}&type=${encodeURIComponent(
                        type,
                      )}`}
                      className="flex items-center gap-1 rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400"
                    >
                      <Plus
                        size={14}
                      />

                      추가
                    </Link>
                  </div>

                  {/* Food items */}
                  {hasItems &&
                  log ? (
                    <div className="divide-y divide-zinc-800/50">
                      {log.items.map(
                        (
                          item,
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            className="flex items-center gap-3 px-4 py-4"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-800">
                                <UtensilsCrossed
                                  size={15}
                                  className="text-zinc-500"
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {
                                    item.food_name
                                  }
                                </p>

                                <p className="mt-1 text-xs text-zinc-500">
                                  {
                                    item.serving
                                  }
                                  {' · '}
                                  {Math.round(
                                    item.kcal,
                                  )}
                                  kcal
                                </p>

                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <NutritionChip className="text-amber-400">
                                    탄{' '}
                                    {roundOne(
                                      item.carbs_g,
                                    )}
                                    g
                                  </NutritionChip>

                                  <NutritionChip className="text-blue-400">
                                    단{' '}
                                    {roundOne(
                                      item.protein_g,
                                    )}
                                    g
                                  </NutritionChip>

                                  <NutritionChip className="text-rose-400">
                                    지{' '}
                                    {roundOne(
                                      item.fat_g,
                                    )}
                                    g
                                  </NutritionChip>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={
                                deletingItemId ===
                                item.id
                              }
                              onClick={() => {
                                void handleDelete(
                                  log,
                                  item.id,
                                );
                              }}
                              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-zinc-700 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                              aria-label="음식 삭제"
                            >
                              <Trash2
                                size={15}
                              />
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <Link
                      href={`/meals/add?date=${date}&type=${encodeURIComponent(
                        type,
                      )}`}
                      className="flex items-center gap-3 px-4 py-5 text-zinc-600 transition-colors hover:bg-zinc-900"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800/60">
                        <Plus
                          size={15}
                        />
                      </div>

                      <div>
                        <p className="text-xs font-medium">
                          {type}을 기록해보세요
                        </p>

                        <p className="mt-1 text-[10px] text-zinc-700">
                          검색 또는 직접 입력으로 음식을 추가할 수 있어요
                        </p>
                      </div>
                    </Link>
                  )}
                </article>
              );
            },
          )}
        </div>
      </section>

      <div className="h-4" />
    </AppShell>
  );
}


function MacroMetric({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="px-2 text-center">
      <p
        className={`text-base font-bold ${className}`}
      >
        {roundOne(
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


function NutritionChip({
  children,
  className,
}: {
  children:
    React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`rounded-lg bg-zinc-800/70 px-2 py-1 text-[10px] font-medium ${className}`}
    >
      {children}
    </span>
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
