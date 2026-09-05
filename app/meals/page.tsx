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
  Camera,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';

import AppShell from '@/components/AppShell';

import { useStore } from '@/lib/store';

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

const MEAL_GOALS = {
  kcal: 2000,
  carbs_g: 250,
  protein_g: 150,
  fat_g: 55,
};

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

    if (isGuest) {
      setIsLoading(
        false,
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

        const supabase =
          createClient();

        const {
          data:
            authData,
        } =
          await supabase.auth.getUser();

        if (
          !authData.user
        ) {
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
          console.error(
            'Meal load failed:',
            error.message,
          );

          setIsLoading(
            false,
          );

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
         * 다른 로컬 사용자/Guest 데이터는 유지하고
         * 현재 로그인 사용자의 식단만 Supabase 데이터로 교체.
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

        setIsLoading(
          false,
        );
      };

    void loadMeals();
  }, [
    user?.id,
    isGuest,
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

  const kcalPercent =
    Math.min(
      100,
      Math.round(
        (
          nutrition.kcal /
          MEAL_GOALS.kcal
        ) *
          100,
      ),
    );

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

          <p className="mt-2 text-sm text-zinc-500">
            하루 섭취량과 영양 균형을 기록하세요.
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
          >
            <ChevronRight
              size={19}
            />
          </button>
        </div>
      </section>

      {/* Loading */}
      {isLoading && (
        <div className="mx-5 mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />

            <p className="text-xs text-zinc-500">
              식단 기록을 불러오고 있어요
            </p>
          </div>
        </div>
      )}

      {/* Nutrition */}
      <section className="px-5 mb-7">
        <div className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-zinc-500">
                섭취 칼로리
              </p>

              <p className="mt-1 text-3xl font-bold">
                {Math.round(
                  nutrition.kcal,
                )}

                <span className="ml-1 text-sm font-medium text-zinc-500">
                  kcal
                </span>
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                목표{' '}
                {
                  MEAL_GOALS.kcal
                }{' '}
                kcal
              </p>
            </div>

            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
              <span className="text-sm font-bold text-emerald-400">
                {kcalPercent}%
              </span>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{
                width:
                  `${kcalPercent}%`,
              }}
            />
          </div>

          <div className="mt-6 grid grid-cols-3 divide-x divide-zinc-800">
            <MacroMetric
              label="탄수화물"
              value={
                nutrition.carbs_g
              }
              goal={
                MEAL_GOALS.carbs_g
              }
              className="text-amber-400"
            />

            <MacroMetric
              label="단백질"
              value={
                nutrition.protein_g
              }
              goal={
                MEAL_GOALS.protein_g
              }
              className="text-blue-400"
            />

            <MacroMetric
              label="지방"
              value={
                nutrition.fat_g
              }
              goal={
                MEAL_GOALS.fat_g
              }
              className="text-rose-400"
            />
          </div>
        </div>
      </section>

      {/* AI future entry */}
      <section className="px-5 mb-7">
        <Link
          href={`/meals/add?date=${date}&type=간식`}
          className="flex items-center justify-between rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Camera
                size={19}
                className="text-emerald-400"
              />
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold">
                  음식 기록 추가
                </p>

                <Sparkles
                  size={12}
                  className="text-blue-400"
                />
              </div>

              <p className="mt-1 text-xs text-zinc-500">
                검색 또는 직접 입력으로 기록하세요
              </p>
            </div>
          </div>

          <ChevronRight
            size={18}
            className="text-zinc-700"
          />
        </Link>
      </section>

      {/* Meals */}
      <section className="px-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-zinc-200">
            식사 기록
          </h2>
        </div>

        <div className="space-y-3">
          {mealsByType.map(
            ({
              type,
              log,
            }) => {
              const typeKcal =
                log?.items.reduce(
                  (sum, item) =>
                    sum +
                    item.kcal,
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
                        <p className="text-sm font-semibold">
                          {type}
                        </p>

                        {typeKcal >
                          0 && (
                          <span className="text-xs text-zinc-600">
                            {Math.round(
                              typeKcal,
                            )}{' '}
                            kcal
                          </span>
                        )}
                      </div>
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
                  {log &&
                  log.items.length >
                    0 ? (
                    <div className="divide-y divide-zinc-800/50">
                      {log.items.map(
                        (item) => (
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
                          아직 기록이 없어요
                        </p>

                        <p className="mt-1 text-[10px] text-zinc-700">
                          눌러서 음식을 추가하세요
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
  goal,
  className,
}: {
  label: string;
  value: number;
  goal: number;
  className: string;
}) {
  const pct =
    Math.min(
      100,
      Math.round(
        (
          value /
          goal
        ) *
          100,
      ),
    );

  return (
    <div className="px-2 text-center">
      <p
        className={`text-base font-bold ${className}`}
      >
        {Math.round(
          value,
        )}
        g
      </p>

      <p className="mt-1 text-[10px] text-zinc-600">
        {label}
      </p>

      <p className="mt-1 text-[9px] text-zinc-700">
        목표 {goal}g ·{' '}
        {pct}%
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