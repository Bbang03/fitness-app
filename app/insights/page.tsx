'use client';

import {
  useEffect,
  useMemo,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Dumbbell,
  Gauge,
  Sparkles,
  Target,
  UtensilsCrossed,
} from 'lucide-react';

import AppShell from '@/components/AppShell';

import {
  useStore,
} from '@/lib/store';

import {
  predict,
} from '@/lib/prediction';


function dateKeyDaysAgo(
  daysAgo: number,
) {
  const date =
    new Date();

  date.setDate(
    date.getDate() -
      daysAgo,
  );

  return date
    .toLocaleDateString(
      'en-CA',
    );
}


function confidenceText(
  confidence:
    'low'
    | 'medium'
    | 'high',
) {
  if (
    confidence ===
    'high'
  ) {
    return '높음';
  }

  if (
    confidence ===
    'medium'
  ) {
    return '보통';
  }

  return '낮음';
}


function confidenceClass(
  confidence:
    'low'
    | 'medium'
    | 'high',
) {
  if (
    confidence ===
    'high'
  ) {
    return (
      'border-emerald-500/20 ' +
      'bg-emerald-500/10 ' +
      'text-emerald-300'
    );
  }

  if (
    confidence ===
    'medium'
  ) {
    return (
      'border-amber-500/20 ' +
      'bg-amber-500/10 ' +
      'text-amber-300'
    );
  }

  return (
    'border-zinc-700 ' +
    'bg-zinc-800 ' +
    'text-zinc-400'
  );
}


function signed(
  value: number,
  unit: string,
) {
  const prefix =
    value > 0
      ? '+'
      : '';

  return (
    `${prefix}${value.toFixed(
      1,
    )}${unit}`
  );
}


export default function InsightsPage() {
  const router =
    useRouter();

  const {
    currentUser,
    workoutLogs,
    mealLogs,
    getInbodyRecords,
    loadInbodyRecords,
  } = useStore();

  const user =
    currentUser();

  useEffect(() => {
    if (!user) {
      router.replace(
        '/login',
      );

      return;
    }

    void loadInbodyRecords();
  }, [
    user?.id,
    router,
    loadInbodyRecords,
  ]);

  const userWorkoutLogs =
    useMemo(
      () =>
        user
          ? workoutLogs.filter(
              (
                log,
              ) =>
                log.user_id ===
                user.id,
            )
          : [],
      [
        user?.id,
        workoutLogs,
      ],
    );

  const userMealLogs =
    useMemo(
      () =>
        user
          ? mealLogs.filter(
              (
                log,
              ) =>
                log.user_id ===
                user.id,
            )
          : [],
      [
        user?.id,
        mealLogs,
      ],
    );

  const inbodyRecords =
    getInbodyRecords();

  const recentNutrition =
    useMemo(() => {
      if (!user) {
        return {
          avgKcal: 0,
          avgProtein: 0,
          days: 0,
        };
      }

      const cutoff =
        dateKeyDaysAgo(
          29,
        );

      const recentMeals =
        userMealLogs.filter(
          (
            log,
          ) =>
            log.date >=
            cutoff,
        );

      const byDate =
        new Map<
          string,
          {
            kcal: number;
            protein: number;
          }
        >();

      for (
        const log
        of recentMeals
      ) {
        const existing =
          byDate.get(
            log.date,
          ) ?? {
            kcal: 0,
            protein: 0,
          };

        for (
          const item
          of log.items
        ) {
          existing.kcal +=
            item.kcal;

          existing.protein +=
            item.protein_g;
        }

        byDate.set(
          log.date,
          existing,
        );
      }

      if (
        byDate.size === 0
      ) {
        return {
          avgKcal: 0,
          avgProtein: 0,
          days: 0,
        };
      }

      let kcal = 0;
      let protein = 0;

      for (
        const summary
        of byDate.values()
      ) {
        kcal +=
          summary.kcal;

        protein +=
          summary.protein;
      }

      return {
        avgKcal:
          kcal /
          byDate.size,

        avgProtein:
          protein /
          byDate.size,

        days:
          byDate.size,
      };
    }, [
      user?.id,
      userMealLogs,
    ]);

  const weeklyWorkout =
    useMemo(() => {
      const cutoff =
        new Date();

      cutoff.setDate(
        cutoff.getDate() -
          7,
      );

      const recent =
        userWorkoutLogs.filter(
          (
            log,
          ) =>
            new Date(
              log.started_at,
            ) >=
            cutoff,
        );

      const volume =
        recent
          .flatMap(
            (
              log,
            ) =>
              log.sets,
          )
          .reduce(
            (
              total,
              set,
            ) =>
              total +
              set.weight_kg *
                set.reps,
            0,
          );

      return {
        sessions:
          recent.length,

        volume,
      };
    }, [
      userWorkoutLogs,
    ]);

  const recentWorkoutCount =
    useMemo(() => {
      const cutoff =
        dateKeyDaysAgo(
          29,
        );

      return (
        userWorkoutLogs.filter(
          (
            log,
          ) =>
            log.date >=
            cutoff,
        ).length
      );
    }, [
      userWorkoutLogs,
    ]);

  if (!user) {
    return null;
  }

  const latest =
    inbodyRecords.at(
      -1,
    ) ?? null;

  const previous =
    inbodyRecords.length >=
    2
      ? inbodyRecords.at(
          -2,
        ) ?? null
      : null;

  const prediction =
    latest
      ? predict({
          user: {
            height_cm:
              user.height_cm,

            sex:
              user.sex,

            birth_year:
              user.birth_year,
          },

          latestInbody:
            latest,

          avgDailyKcal:
            recentNutrition
              .avgKcal,

          avgDailyProtein_g:
            recentNutrition
              .avgProtein,

          weeklyVolume_kg:
            weeklyWorkout
              .volume,

          days: 30,
        })
      : null;

  /*
   * 데이터 준비도.
   *
   * 모델 정확도가 아니라
   * "현재 예측에 사용할 기록이
   * 얼마나 갖춰져 있는가"를 표현한다.
   */
  let readiness = 10;

  if (
    inbodyRecords.length >=
    1
  ) {
    readiness += 30;
  }

  if (
    inbodyRecords.length >=
    2
  ) {
    readiness += 10;
  }

  if (
    recentNutrition.days >=
    3
  ) {
    readiness += 10;
  }

  if (
    recentNutrition.days >=
    7
  ) {
    readiness += 15;
  }

  if (
    recentWorkoutCount >=
    2
  ) {
    readiness += 10;
  }

  if (
    recentWorkoutCount >=
    4
  ) {
    readiness += 10;
  }

  readiness =
    Math.min(
      readiness,
      100,
    );

  const latestWeightDelta =
    latest &&
    previous
      ? latest.weight_kg -
        previous.weight_kg
      : null;

  const latestMuscleDelta =
    latest &&
    previous
      ? latest
          .skeletal_muscle_kg -
        previous
          .skeletal_muscle_kg
      : null;

  const latestFatPctDelta =
    latest &&
    previous
      ? latest.body_fat_pct -
        previous.body_fat_pct
      : null;

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
          FitTrack AI
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          인사이트
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          운동·식단·체성분 기록을
          함께 분석해 현재 상태와
          앞으로의 변화를 보여줍니다.
        </p>
      </header>

      <main className="px-5 pb-8">
        {!latest ? (
          <section className="overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/15 via-zinc-900 to-zinc-950 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15">
              <BrainCircuit
                size={22}
                className="text-blue-400"
              />
            </div>

            <p className="mt-5 text-xs font-semibold text-blue-400">
              체성분 예측
            </p>

            <h2 className="mt-2 text-xl font-bold">
              첫 체성분 기록이 필요해요
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              인바디 결과를 입력하면
              운동과 식단 기록을 함께
              사용해 30일 후 체성분
              변화를 예측할 수 있습니다.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  '/inbody/new',
                )
              }
              className="mt-5 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              체성분 기록 추가
            </button>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/15 via-zinc-900 to-zinc-950 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-blue-400">
                    30일 후 체성분 예측
                  </p>

                  <h2 className="mt-2 text-xl font-bold">
                    현재 패턴이 계속된다면
                  </h2>
                </div>

                {prediction && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${confidenceClass(
                      prediction.confidence,
                    )}`}
                  >
                    신뢰도{' '}
                    {confidenceText(
                      prediction.confidence,
                    )}
                  </span>
                )}
              </div>

              {prediction && (
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <PredictionMetric
                    label="체중"
                    value={`${prediction.predictedWeight_kg}kg`}
                    delta={signed(
                      prediction.deltaWeight_kg,
                      'kg',
                    )}
                    positive={
                      prediction.deltaWeight_kg >
                      0
                    }
                  />

                  <PredictionMetric
                    label="골격근량"
                    value={`${prediction.predictedSkeletal_kg}kg`}
                    delta={signed(
                      prediction.deltaSkeletal_kg,
                      'kg',
                    )}
                    positive={
                      prediction.deltaSkeletal_kg >=
                      0
                    }
                  />

                  <PredictionMetric
                    label="체지방률"
                    value={`${prediction.predictedBodyFatPct}%`}
                    delta={signed(
                      prediction.deltaBodyFatPct,
                      '%',
                    )}
                    positive={
                      prediction.deltaBodyFatPct >
                      0
                    }
                    invert
                  />
                </div>
              )}

              {prediction && (
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-4 text-center">
                  <MiniMetric
                    label="BMR"
                    value={`${prediction.bmr}`}
                    suffix="kcal"
                  />

                  <MiniMetric
                    label="추정 TDEE"
                    value={`${prediction.tdee}`}
                    suffix="kcal"
                  />

                  <MiniMetric
                    label="에너지 수지"
                    value={`${
                      prediction
                        .caloricBalance >
                      0
                        ? '+'
                        : ''
                    }${prediction.caloricBalance}`}
                    suffix="kcal"
                  />
                </div>
              )}
            </section>

            <section className="mt-7">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-200">
                  현재 체성분
                </h2>

                <span className="text-[10px] text-zinc-600">
                  {latest.measured_at}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <CurrentMetric
                  label="체중"
                  value={`${latest.weight_kg}kg`}
                  delta={
                    latestWeightDelta
                  }
                  unit="kg"
                />

                <CurrentMetric
                  label="골격근량"
                  value={`${latest.skeletal_muscle_kg}kg`}
                  delta={
                    latestMuscleDelta
                  }
                  unit="kg"
                />

                <CurrentMetric
                  label="체지방률"
                  value={`${latest.body_fat_pct}%`}
                  delta={
                    latestFatPctDelta
                  }
                  unit="%"
                  invert
                />
              </div>
            </section>
          </>
        )}

        <section className="mt-7">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              최근 기록 요약
            </h2>

            <span className="text-[10px] text-zinc-600">
              최근 30일
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <DataRow
              icon={
                UtensilsCrossed
              }
              label="평균 섭취 열량"
              value={
                recentNutrition.days >
                0
                  ? `${Math.round(
                      recentNutrition.avgKcal,
                    )} kcal`
                  : '기록 부족'
              }
              subValue={
                recentNutrition.days >
                0
                  ? `${recentNutrition.days}일 기록`
                  : undefined
              }
              className="text-emerald-400"
            />

            <DataRow
              icon={
                Target
              }
              label="평균 단백질"
              value={
                recentNutrition.days >
                0
                  ? `${Math.round(
                      recentNutrition.avgProtein,
                    )} g`
                  : '기록 부족'
              }
              className="text-amber-400"
            />

            <DataRow
              icon={
                Dumbbell
              }
              label="최근 운동"
              value={`${recentWorkoutCount}회`}
              subValue={
                weeklyWorkout.volume >
                0
                  ? `주간 볼륨 ${Math.round(
                      weeklyWorkout.volume,
                    ).toLocaleString()}kg`
                  : undefined
              }
              className="text-blue-400"
            />

            <DataRow
              icon={
                Activity
              }
              label="체성분 기록"
              value={`${inbodyRecords.length}회`}
              className="text-violet-400"
            />
          </div>
        </section>

        <section className="mt-7 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge
                size={17}
                className="text-blue-400"
              />

              <p className="text-sm font-semibold">
                예측 데이터 준비도
              </p>
            </div>

            <span className="text-sm font-bold text-blue-400">
              {readiness}%
            </span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{
                width:
                  `${readiness}%`,
              }}
            />
          </div>

          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            체성분 측정, 식단 기록,
            운동 기록이 꾸준히 쌓일수록
            예측에 사용할 수 있는 정보가
            많아집니다.
          </p>
        </section>

        {prediction && (
          <section className="mt-7">
            <div className="flex items-center gap-2">
              <Sparkles
                size={17}
                className="text-amber-400"
              />

              <h2 className="text-sm font-semibold text-zinc-200">
                이번 예측에 영향을 준 요인
              </h2>
            </div>

            <div className="mt-3 space-y-2">
              {prediction.factors.map(
                (
                  factor,
                ) => (
                  <FactorRow
                    key={
                      factor.label
                    }
                    label={
                      factor.label
                    }
                    description={
                      factor.description
                    }
                    effect={
                      factor.effect
                    }
                  />
                ),
              )}
            </div>
          </section>
        )}

        <section className="mt-7 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle
              size={17}
              className="mt-0.5 flex-shrink-0 text-zinc-500"
            />

            <div>
              <p className="text-xs font-semibold text-zinc-300">
                예측 모델 안내
              </p>

              <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                현재 버전은 체성분,
                에너지 수지, 운동량,
                단백질 섭취를 조합한
                설명 가능한 베이스라인
                예측입니다. 실제 체성분
                변화는 수분, 수면, 측정
                조건 등 다양한 요인의
                영향을 받을 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}


function PredictionMetric({
  label,
  value,
  delta,
  positive,
  invert = false,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  invert?: boolean;
}) {
  const good =
    invert
      ? !positive
      : positive;

  return (
    <div className="rounded-2xl bg-zinc-950/50 px-2 py-4 text-center">
      <p className="text-base font-bold text-white">
        {value}
      </p>

      <p
        className={`mt-1 text-[10px] font-medium ${
          good
            ? 'text-emerald-400'
            : 'text-rose-400'
        }`}
      >
        {delta}
      </p>

      <p className="mt-1 text-[10px] text-zinc-600">
        {label}
      </p>
    </div>
  );
}


function CurrentMetric({
  label,
  value,
  delta,
  unit,
  invert = false,
}: {
  label: string;
  value: string;
  delta: number | null;
  unit: string;
  invert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
      <p className="text-sm font-bold text-zinc-100">
        {value}
      </p>

      {delta !== null && (
        <p
          className={`mt-1 text-[10px] ${
            delta === 0
              ? 'text-zinc-500'
              : (
                  invert
                    ? delta < 0
                    : delta > 0
                )
              ? 'text-emerald-400'
              : 'text-rose-400'
          }`}
        >
          {signed(
            delta,
            unit,
          )}
        </p>
      )}

      <p className="mt-1 text-[10px] text-zinc-600">
        {label}
      </p>
    </div>
  );
}


function MiniMetric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-300">
        {value}
        <span className="ml-0.5 text-[9px] font-normal text-zinc-600">
          {suffix}
        </span>
      </p>

      <p className="mt-1 text-[9px] text-zinc-600">
        {label}
      </p>
    </div>
  );
}


function DataRow({
  icon: Icon,
  label,
  value,
  subValue,
  className,
}: {
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;

  label: string;
  value: string;
  subValue?: string;
  className: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-4">
      <div className="flex items-center gap-3">
        <Icon
          size={18}
          className={
            className
          }
        />

        <span className="text-sm text-zinc-300">
          {label}
        </span>
      </div>

      <div className="text-right">
        <p className="text-xs font-semibold text-zinc-300">
          {value}
        </p>

        {subValue && (
          <p className="mt-0.5 text-[9px] text-zinc-600">
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
}


function FactorRow({
  label,
  description,
  effect,
}: {
  label: string;
  description: string;

  effect:
    | 'positive'
    | 'neutral'
    | 'negative';
}) {
  const Icon =
    effect ===
    'positive'
      ? ArrowUpRight
      : effect ===
        'negative'
      ? ArrowDownRight
      : ArrowRight;

  const iconClass =
    effect ===
    'positive'
      ? 'text-emerald-400'
      : effect ===
        'negative'
      ? 'text-rose-400'
      : 'text-zinc-500';

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mt-0.5">
        <Icon
          size={16}
          className={
            iconClass
          }
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-zinc-300">
          {label}
        </p>

        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          {description}
        </p>
      </div>
    </div>
  );
}