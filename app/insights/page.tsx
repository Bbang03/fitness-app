'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  Activity,
  AlertCircle,
  BrainCircuit,
  Dumbbell,
  Gauge,
  RefreshCw,
  Sparkles,
  Target,
  UtensilsCrossed,
} from 'lucide-react';

import AppShell from '@/components/AppShell';

import {
  createClient,
} from '@/lib/supabase/client';

import {
  useStore,
} from '@/lib/store';


type PredictionMetricKey =
  | 'weight_kg'
  | 'skeletal_muscle_kg'
  | 'fat_mass_kg'
  | 'body_fat_pct';


interface PredictionMetricConfig {
  key: PredictionMetricKey;
  label: string;
  unit: string;
}


interface PredictionData {
  sourceRecordId: string;
  endpointWindow: string;

  current: {
    weight_kg: number;
    fat_mass_kg: number;
    skeletal_muscle_kg: number;
    body_fat_pct: number;
  };

  prediction: {
    weight_kg: number;
    fat_mass_kg: number;
    skeletal_muscle_kg: number;
    body_fat_pct: number;
  };

  change: {
    weight_kg: number;
    fat_mass_kg: number;
    skeletal_muscle_kg: number;
    body_fat_pct: number;
  };
}


interface PredictionApiResponse {
  model: {
    name: string;
    version: string;
    endpoint_window: string;
  };

  current: {
    measured_at: string;
    weight_kg: number;
    fat_mass_kg: number;
    skeletal_muscle_kg: number;
    body_fat_pct: number;
  };

  prediction: {
    weight_kg: number;
    fat_mass_kg: number;
    skeletal_muscle_kg: number;
    body_fat_pct: number;
  };

  change: {
    weight_kg: number;
    fat_mass_kg: number;
    skeletal_muscle_kg: number;
    body_fat_pct: number;
  };

  source: {
    inbody_record_id: string;
    inbody_records_used: number;
    authenticated_user: boolean;
  };

  prediction_history_id: string | null;
}


interface PredictionHistoryRow {
  source_inbody_id: string;
  endpoint_window: string | null;

  current_weight_kg: number;
  current_fat_mass_kg: number;
  current_skeletal_muscle_kg: number;
  current_body_fat_pct: number;

  predicted_weight_kg: number;
  predicted_fat_mass_kg: number;
  predicted_skeletal_muscle_kg: number;
  predicted_body_fat_pct: number;

  delta_weight_kg: number;
  delta_fat_mass_kg: number;
  delta_skeletal_muscle_kg: number;
  delta_body_fat_pct: number;

  created_at: string;
}


const PREDICTION_METRICS: PredictionMetricConfig[] = [
  {
    key: 'weight_kg',
    label: '체중',
    unit: 'kg',
  },
  {
    key: 'skeletal_muscle_kg',
    label: '골격근량',
    unit: 'kg',
  },
  {
    key: 'fat_mass_kg',
    label: '체지방량',
    unit: 'kg',
  },
  {
    key: 'body_fat_pct',
    label: '체지방률',
    unit: '%',
  },
];


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


function formatMeasurementDate(
  value: string,
) {
  if (!value) {
    return '';
  }

  return value.includes('T')
    ? value.slice(0, 10)
    : value;
}


function daysBetween(
  newer: string,
  older: string,
) {
  const newerDate =
    new Date(newer);

  const olderDate =
    new Date(older);

  const diff =
    newerDate.getTime() -
    olderDate.getTime();

  if (
    !Number.isFinite(diff)
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      diff /
        86_400_000,
    ),
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


function mapPredictionHistoryRow(
  row: PredictionHistoryRow,
): PredictionData {
  return {
    sourceRecordId:
      row.source_inbody_id,

    endpointWindow:
      row.endpoint_window ??
      '28~35일',

    current: {
      weight_kg:
        Number(
          row.current_weight_kg,
        ),

      fat_mass_kg:
        Number(
          row.current_fat_mass_kg,
        ),

      skeletal_muscle_kg:
        Number(
          row.current_skeletal_muscle_kg,
        ),

      body_fat_pct:
        Number(
          row.current_body_fat_pct,
        ),
    },

    prediction: {
      weight_kg:
        Number(
          row.predicted_weight_kg,
        ),

      fat_mass_kg:
        Number(
          row.predicted_fat_mass_kg,
        ),

      skeletal_muscle_kg:
        Number(
          row.predicted_skeletal_muscle_kg,
        ),

      body_fat_pct:
        Number(
          row.predicted_body_fat_pct,
        ),
    },

    change: {
      weight_kg:
        Number(
          row.delta_weight_kg,
        ),

      fat_mass_kg:
        Number(
          row.delta_fat_mass_kg,
        ),

      skeletal_muscle_kg:
        Number(
          row.delta_skeletal_muscle_kg,
        ),

      body_fat_pct:
        Number(
          row.delta_body_fat_pct,
        ),
    },
  };
}


function mapPredictionApiResponse(
  payload: PredictionApiResponse,
): PredictionData {
  return {
    sourceRecordId:
      payload.source
        .inbody_record_id,

    endpointWindow:
      payload.model
        .endpoint_window ||
      '28~35일',

    current: {
      weight_kg:
        payload.current
          .weight_kg,

      fat_mass_kg:
        payload.current
          .fat_mass_kg,

      skeletal_muscle_kg:
        payload.current
          .skeletal_muscle_kg,

      body_fat_pct:
        payload.current
          .body_fat_pct,
    },

    prediction: {
      weight_kg:
        payload.prediction
          .weight_kg,

      fat_mass_kg:
        payload.prediction
          .fat_mass_kg,

      skeletal_muscle_kg:
        payload.prediction
          .skeletal_muscle_kg,

      body_fat_pct:
        payload.prediction
          .body_fat_pct,
    },

    change: {
      weight_kg:
        payload.change
          .weight_kg,

      fat_mass_kg:
        payload.change
          .fat_mass_kg,

      skeletal_muscle_kg:
        payload.change
          .skeletal_muscle_kg,

      body_fat_pct:
        payload.change
          .body_fat_pct,
    },
  };
}


function getPredictionErrorMessage(
  status: number,
  detail?: string,
) {
  if (status === 401) {
    return '로그인 세션이 만료되었습니다. 다시 로그인해주세요.';
  }

  if (status === 409) {
    return '예측에 사용할 체성분 기록이 없습니다.';
  }

  if (status >= 500) {
    return 'AI 예측 서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }

  return (
    detail ||
    'AI 체성분 예측을 불러오지 못했습니다.'
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

  const inbodyRecords =
    getInbodyRecords();

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

  const [
    prediction,
    setPrediction,
  ] =
    useState<PredictionData | null>(
      null,
    );

  const [
    predictionLoading,
    setPredictionLoading,
  ] =
    useState(false);

  const [
    predictionError,
    setPredictionError,
  ] =
    useState('');

  const [
    predictionRetryKey,
    setPredictionRetryKey,
  ] =
    useState(0);

  const [
    selectedPredictionMetric,
    setSelectedPredictionMetric,
  ] =
    useState<PredictionMetricKey>(
      'weight_kg',
    );

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

  useEffect(() => {
    if (
      !user ||
      !latest
    ) {
      setPrediction(
        null,
      );

      setPredictionError(
        '',
      );

      return;
    }

    let cancelled =
      false;

    const loadPrediction =
      async () => {
        setPredictionLoading(
          true,
        );

        setPredictionError(
          '',
        );

        try {
          const supabase =
            createClient();

          const {
            data:
              existingPrediction,
            error:
              existingError,
          } =
            await supabase
              .from(
                'prediction_history',
              )
              .select(`
                source_inbody_id,
                endpoint_window,
                current_weight_kg,
                current_fat_mass_kg,
                current_skeletal_muscle_kg,
                current_body_fat_pct,
                predicted_weight_kg,
                predicted_fat_mass_kg,
                predicted_skeletal_muscle_kg,
                predicted_body_fat_pct,
                delta_weight_kg,
                delta_fat_mass_kg,
                delta_skeletal_muscle_kg,
                delta_body_fat_pct,
                created_at
              `)
              .eq(
                'user_id',
                user.id,
              )
              .eq(
                'source_inbody_id',
                latest.id,
              )
              .order(
                'created_at',
                {
                  ascending:
                    false,
                },
              )
              .limit(1)
              .maybeSingle();

          if (
            existingError
          ) {
            console.warn(
              'Prediction history lookup failed:',
              existingError.message,
            );
          }

          if (
            existingPrediction
          ) {
            if (
              !cancelled
            ) {
              setPrediction(
                mapPredictionHistoryRow(
                  existingPrediction as
                    PredictionHistoryRow,
                ),
              );
            }

            return;
          }

          const {
            data: {
              session,
            },
            error:
              sessionError,
          } =
            await supabase
              .auth
              .getSession();

          if (
            sessionError
          ) {
            throw new Error(
              '로그인 정보를 확인하지 못했습니다.',
            );
          }

          if (
            !session
              ?.access_token
          ) {
            throw new Error(
              'AI 예측은 로그인한 사용자만 사용할 수 있습니다.',
            );
          }

          const response =
            await fetch(
              '/api/predict',
              {
                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',

                  Authorization:
                    `Bearer ${session.access_token}`,
                },

                body:
                  JSON.stringify({
                    save_prediction:
                      false,
                  }),

                cache:
                  'no-store',
              },
            );

          let payload:
            | PredictionApiResponse
            | {
                detail?:
                  string;
              }
            | null =
            null;

          try {
            payload =
              await response
                .json();
          } catch {
            payload =
              null;
          }

          if (
            !response.ok
          ) {
            const detail =
              payload &&
              'detail' in
                payload &&
              typeof payload.detail ===
                'string'
                ? payload.detail
                : undefined;

            throw new Error(
              getPredictionErrorMessage(
                response.status,
                detail,
              ),
            );
          }

          if (
            !payload ||
            !(
              'prediction' in
              payload
            )
          ) {
            throw new Error(
              '예측 응답 형식이 올바르지 않습니다.',
            );
          }

          if (
            !cancelled
          ) {
            setPrediction(
              mapPredictionApiResponse(
                payload as
                  PredictionApiResponse,
              ),
            );
          }
        } catch (
          caught
        ) {
          if (
            cancelled
          ) {
            return;
          }

          setPrediction(
            null,
          );

          setPredictionError(
            caught instanceof
              Error
              ? caught.message
              : 'AI 체성분 예측을 불러오지 못했습니다.',
          );
        } finally {
          if (
            !cancelled
          ) {
            setPredictionLoading(
              false,
            );
          }
        }
      };

    void loadPrediction();

    return () => {
      cancelled =
        true;
    };
  }, [
    user?.id,
    latest?.id,
    predictionRetryKey,
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
        byDate.size ===
        0
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

  const previousGapDays =
    latest &&
    previous
      ? daysBetween(
          latest.measured_at,
          previous.measured_at,
        )
      : null;

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
          CHAGOK AI
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          인사이트
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          체성분 기록을 바탕으로
          현재 상태와 앞으로의 변화를
          보여주고, 운동·식단 기록은
          최근 활동 요약으로 함께
          확인합니다.
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
              체성분 측정 결과를
              입력하면 현재 기록을
              기준으로 약 한 달 뒤
              체성분 변화를 예측할 수
              있습니다.
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
                    30일 체성분 예상 추이
                  </p>

                  <h2 className="mt-2 text-xl font-bold">
                    한 달 뒤의 변화를
                    그래프로 확인해보세요
                  </h2>
                </div>

                <span className="flex-shrink-0 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-300">
                  28~35일 후
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                최근 체성분 측정을
                기준으로 AI가 예측한
                한 달 뒤 값을 현재값과
                연결해 예상 흐름을
                보여줍니다.
              </p>

              {predictionLoading ? (
                <div className="mt-5 flex min-h-56 items-center justify-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/35 text-sm text-zinc-500">
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                  />

                  AI 예측을 불러오는 중...
                </div>
              ) : predictionError ? (
                <div className="mt-5 rounded-2xl border border-red-900/40 bg-red-950/20 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      size={15}
                      className="mt-0.5 flex-shrink-0 text-red-400"
                    />

                    <p className="text-xs leading-relaxed text-red-300">
                      {predictionError}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPredictionRetryKey(
                        (
                          previousKey,
                        ) =>
                          previousKey +
                          1,
                      )
                    }
                    className="mt-4 w-full rounded-xl border border-zinc-700 px-3 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
                  >
                    다시 시도
                  </button>
                </div>
              ) : prediction ? (
                <>
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {PREDICTION_METRICS.map(
                      (
                        metric,
                      ) => {
                        const active =
                          selectedPredictionMetric ===
                          metric.key;

                        return (
                          <button
                            key={
                              metric.key
                            }
                            type="button"
                            onClick={() =>
                              setSelectedPredictionMetric(
                                metric.key,
                              )
                            }
                            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                              active
                                ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                                : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                            }`}
                          >
                            {metric.label}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/35 px-2 pb-2 pt-4">
                    <PredictionTrendChart
                      prediction={
                        prediction
                      }
                      metricKey={
                        selectedPredictionMetric
                      }
                    />
                  </div>

                  <PredictionTrendSummary
                    prediction={
                      prediction
                    }
                    metricKey={
                      selectedPredictionMetric
                    }
                  />

                  <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
                    그래프의 중간 구간은
                    현재값과 AI가 예측한
                    28~35일 후 값을
                    연결한 시각적 예상
                    추이입니다. AI 모델이
                    직접 예측하는 시점은
                    약 한 달 후입니다.
                  </p>
                </>
              ) : null}
            </section>

            <section className="mt-7">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-200">
                  현재 체성분
                </h2>

                <span className="text-[10px] text-zinc-600">
                  {formatMeasurementDate(
                    latest.measured_at,
                  )}
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

        {latest && (
          <section className="mt-7 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center gap-2">
              <Gauge
                size={17}
                className="text-blue-400"
              />

              <p className="text-sm font-semibold">
                체성분 예측 기준
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <InfoMetric
                label="기준 측정"
                value={
                  formatMeasurementDate(
                    latest.measured_at,
                  )
                }
              />

              <InfoMetric
                label="예측 시점"
                value="28~35일 후"
              />

              <InfoMetric
                label="사용된 체성분"
                value={`${inbodyRecords.length}개`}
              />

              <InfoMetric
                label="이전 기록"
                value={
                  previous
                    ? previousGapDays !==
                      null
                      ? `직전 ${previousGapDays}일 전`
                      : '이전 기록 반영'
                    : '첫 기록 기반'
                }
              />
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
              현재 AI 체성분 예측은
              체성분 측정 기록의 변화
              패턴을 사용합니다. 위의
              운동·식단 정보는 최근
              활동을 한눈에 보기 위한
              요약이며 체성분 예측 모델의
              입력값으로 사용하지
              않습니다.
            </p>
          </section>
        )}

        {prediction && (
          <section className="mt-7">
            <div className="flex items-center gap-2">
              <Sparkles
                size={17}
                className="text-amber-400"
              />

              <h2 className="text-sm font-semibold text-zinc-200">
                이번 예측에 사용된 정보
              </h2>
            </div>

            <div className="mt-3 space-y-2">
              <InsightRow
                title="최근 체성분 측정"
                description={`${formatMeasurementDate(
                  latest?.measured_at ??
                    '',
                )} 측정값을 현재 상태의 기준으로 사용했습니다.`}
              />

              <InsightRow
                title="이전 체성분 기록"
                description={
                  previous
                    ? `현재 측정보다 이전의 체성분 기록을 개인 변화 패턴에 반영했습니다.`
                    : '이전 측정 기록이 없어 현재 체성분을 기준으로 예측했습니다.'
                }
              />
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
                AI 예측은 현재까지의
                체성분 기록을 바탕으로 한
                참고 정보입니다. 실제
                변화는 생활 습관, 수분,
                수면, 측정 조건 등 다양한
                요인의 영향을 받아 예측과
                차이가 발생할 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}


function PredictionTrendChart({
  prediction,
  metricKey,
}: {
  prediction:
    PredictionData;

  metricKey:
    PredictionMetricKey;
}) {
  const metric =
    PREDICTION_METRICS.find(
      (
        item,
      ) =>
        item.key ===
        metricKey,
    ) ??
    PREDICTION_METRICS[0];

  const currentValue =
    prediction.current[
      metricKey
    ];

  const predictedValue =
    prediction.prediction[
      metricKey
    ];

  const days = [
    0,
    7,
    14,
    21,
    30,
  ];

  /*
   * Production 모델은 약 한 달 뒤 endpoint만 직접 예측한다.
   * 중간 구간은 추가 예측값을 만들어내지 않고,
   * 현재값과 endpoint 사이를 smoothstep으로 시각화한다.
   * 3t^2 - 2t^3는 시작/끝의 기울기가 완만한 S-curve다.
   */
  const easedProgress = (
    day: number,
  ) => {
    const t =
      Math.min(
        1,
        Math.max(
          0,
          day / 30,
        ),
      );

    return (
      t *
      t *
      (
        3 -
        2 * t
      )
    );
  };

  const valueAtDay = (
    day: number,
  ) =>
    currentValue +
    (
      predictedValue -
      currentValue
    ) *
      easedProgress(
        day,
      );

  const markerValues =
    days.map(
      (
        day,
      ) =>
        valueAtDay(
          day,
        ),
    );

  const W = 340;
  const H = 190;

  const PAD = {
    top: 18,
    right: 14,
    bottom: 30,
    left: 42,
  };

  const innerW =
    W -
    PAD.left -
    PAD.right;

  const innerH =
    H -
    PAD.top -
    PAD.bottom;

  const rawMin =
    Math.min(
      currentValue,
      predictedValue,
    );

  const rawMax =
    Math.max(
      currentValue,
      predictedValue,
    );

  const rawRange =
    rawMax -
    rawMin;

  const minimumPad =
    metric.unit ===
    '%'
      ? 0.5
      : 0.25;

  const padding =
    Math.max(
      minimumPad,
      rawRange *
        0.8,
    );

  const min =
    rawMin -
    padding;

  const max =
    rawMax +
    padding;

  const range =
    Math.max(
      max -
        min,
      0.1,
    );

  const xOfDay = (
    day: number,
  ) =>
    PAD.left +
    (
      day /
      30
    ) *
      innerW;

  const yOf = (
    value: number,
  ) =>
    PAD.top +
    (
      (
        max -
        value
      ) /
      range
    ) *
      innerH;

  const startX =
    xOfDay(
      0,
    );

  const endX =
    xOfDay(
      30,
    );

  const startY =
    yOf(
      currentValue,
    );

  const endY =
    yOf(
      predictedValue,
    );

  /*
   * x control point를 정확히 1/3, 2/3 지점에 두면
   * x축은 시간에 대해 선형으로 유지되고,
   * y축만 smoothstep 형태의 부드러운 곡선이 된다.
   */
  const path = [
    `M ${startX.toFixed(
      1,
    )} ${startY.toFixed(
      1,
    )}`,

    `C ${(
      startX +
      innerW / 3
    ).toFixed(
      1,
    )} ${startY.toFixed(
      1,
    )}`,

    `${(
      startX +
      (
        innerW * 2
      ) / 3
    ).toFixed(
      1,
    )} ${endY.toFixed(
      1,
    )}`,

    `${endX.toFixed(
      1,
    )} ${endY.toFixed(
      1,
    )}`,
  ].join(' ');

  const yTicks = [
    max,
    (
      max +
      min
    ) /
      2,
    min,
  ];

  return (
    <div>
      <div className="mb-2 flex items-end justify-between px-2">
        <div>
          <p className="text-[10px] text-zinc-600">
            선택 항목
          </p>

          <p className="mt-0.5 text-xs font-semibold text-zinc-300">
            {metric.label}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[10px] text-zinc-600">
            30일 후 예상
          </p>

          <p className="mt-0.5 text-sm font-bold text-blue-300">
            {predictedValue.toFixed(
              1,
            )}
            {metric.unit}
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{
          maxHeight:
            H,
        }}
        aria-label={`${metric.label} 30일 예상 추이 그래프`}
      >
        <defs>
          <linearGradient
            id={`prediction-line-fill-${metricKey}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#60a5fa"
              stopOpacity="0.16"
            />

            <stop
              offset="100%"
              stopColor="#60a5fa"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {yTicks.map(
          (
            tick,
            index,
          ) => {
            const y =
              yOf(
                tick,
              );

            return (
              <g
                key={
                  index
                }
              >
                <line
                  x1={
                    PAD.left
                  }
                  y1={y}
                  x2={
                    W -
                    PAD.right
                  }
                  y2={y}
                  stroke="#3f3f46"
                  strokeWidth="1"
                  opacity="0.55"
                />

                <text
                  x={
                    PAD.left -
                    5
                  }
                  y={
                    y +
                    3
                  }
                  textAnchor="end"
                  fontSize="8"
                  fill="#71717a"
                >
                  {tick.toFixed(
                    1,
                  )}
                </text>
              </g>
            );
          },
        )}

        <path
          d={`${path} L ${endX.toFixed(
            1,
          )} ${(
            H -
            PAD.bottom
          ).toFixed(
            1,
          )} L ${startX.toFixed(
            1,
          )} ${(
            H -
            PAD.bottom
          ).toFixed(
            1,
          )} Z`}
          fill={`url(#prediction-line-fill-${metricKey})`}
          stroke="none"
        />

        <path
          d={path}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="2.75"
          strokeDasharray="7 5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {markerValues.map(
          (
            value,
            index,
          ) => (
            <circle
              key={
                days[
                  index
                ]
              }
              cx={
                xOfDay(
                  days[
                    index
                  ],
                )
              }
              cy={
                yOf(
                  value,
                )
              }
              r={
                index ===
                  0 ||
                index ===
                  markerValues.length -
                    1
                  ? 4
                  : 2.5
              }
              fill={
                index ===
                  markerValues.length -
                    1
                  ? '#60a5fa'
                  : '#a1a1aa'
              }
            />
          ),
        )}

        {days.map(
          (
            day,
          ) => (
            <text
              key={
                day
              }
              x={
                xOfDay(
                  day,
                )
              }
              y={
                H -
                7
              }
              textAnchor="middle"
              fontSize="8"
              fill="#71717a"
            >
              {day ===
              0
                ? '현재'
                : `${day}일`}
            </text>
          ),
        )}
      </svg>
    </div>
  );
}

function PredictionTrendSummary({
  prediction,
  metricKey,
}: {
  prediction:
    PredictionData;

  metricKey:
    PredictionMetricKey;
}) {
  const metric =
    PREDICTION_METRICS.find(
      (
        item,
      ) =>
        item.key ===
        metricKey,
    ) ??
    PREDICTION_METRICS[0];

  const currentValue =
    prediction.current[
      metricKey
    ];

  const predictedValue =
    prediction.prediction[
      metricKey
    ];

  const change =
    prediction.change[
      metricKey
    ];

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <TrendSummaryItem
        label="현재"
        value={`${currentValue.toFixed(
          1,
        )}${metric.unit}`}
      />

      <TrendSummaryItem
        label="30일 후"
        value={`${predictedValue.toFixed(
          1,
        )}${metric.unit}`}
        accent
      />

      <TrendSummaryItem
        label="예상 변화"
        value={
          signed(
            change,
            metric.unit,
          )
        }
      />
    </div>
  );
}


function TrendSummaryItem({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-zinc-950/40 px-2 py-3 text-center">
      <p className="text-[9px] text-zinc-600">
        {label}
      </p>

      <p
        className={`mt-1 text-xs font-bold ${
          accent
            ? 'text-blue-300'
            : 'text-zinc-300'
        }`}
      >
        {value}
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
                    ? delta <
                      0
                    : delta >
                      0
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


function InfoMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-950/40 p-3">
      <p className="text-[10px] text-zinc-600">
        {label}
      </p>

      <p className="mt-1 text-xs font-semibold text-zinc-300">
        {value}
      </p>
    </div>
  );
}


function InsightRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs font-semibold text-zinc-300">
        {title}
      </p>

      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        {description}
      </p>
    </div>
  );
}
