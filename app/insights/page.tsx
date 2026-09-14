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


interface PredictionBehaviorCorrection {
  applied: boolean;

  gate?: {
    reason?: string | null;
    observed_meal_days?: number;
    minimum_observed_meal_days?: number;
  };
}


interface PredictionIntervalBand {
  coverage: number;
  lower: number;
  upper: number;
  lower_residual_quantile?: number;
  upper_residual_quantile?: number;
  empirical_participant_macro_coverage?: number | null;
  empirical_row_coverage?: number | null;
}


interface PredictionIntervalMetric {
  center: number;
  unit: string;
  calibration_target: string;
  default_coverage: number;
  default_interval: PredictionIntervalBand;
  intervals: Record<
    string,
    PredictionIntervalBand
  >;
}


interface PredictionIntervalData {
  artifact_version: string;
  production_model_version: string;
  default_coverage: number;
  available_coverages: number[];
  center_policy: string;
  behavior_correction_applied: boolean;
  behavior_correction_uncertainty_calibrated: boolean;
  metrics: Record<
    PredictionMetricKey,
    PredictionIntervalMetric
  >;
}


interface PredictionChartRecord {
  measured_at: string;
  weight_kg: number;
  fat_mass_kg: number;
  skeletal_muscle_kg: number;
  body_fat_pct: number;
}


interface PredictionData {
  sourceRecordId: string;
  endpointWindow: string;
  predictionDate: string | null;
  currentMeasuredAt: string;
  behaviorCorrection: PredictionBehaviorCorrection | null;
  predictionInterval: PredictionIntervalData | null;

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
    prediction_date?: string;
  };

  behavior_correction?: PredictionBehaviorCorrection;
  prediction_interval?: PredictionIntervalData;

  prediction_history_id: string | null;
}


interface PredictionHistoryRow {
  source_inbody_id: string;
  endpoint_window: string | null;
  prediction_date: string;
  current_measured_at: string;

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

  quality_meta:
    | {
        behavior_correction?:
          | PredictionBehaviorCorrection
          | null;

        prediction_interval?:
          | PredictionIntervalData
          | null;
      }
    | null;

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


const KST_OFFSET_MS =
  9 * 60 * 60 * 1000;

const SERVICE_ROLLOVER_HOUR_KST =
  3;


function dateKeyFromUtcParts(
  value: Date,
) {
  const year =
    value.getUTCFullYear();

  const month =
    String(
      value.getUTCMonth() + 1,
    ).padStart(
      2,
      '0',
    );

  const day =
    String(
      value.getUTCDate(),
    ).padStart(
      2,
      '0',
    );

  return `${year}-${month}-${day}`;
}


function resolveServicePredictionDate(
  now = new Date(),
) {
  const kst =
    new Date(
      now.getTime() +
        KST_OFFSET_MS,
    );

  if (
    kst.getUTCHours() <
    SERVICE_ROLLOVER_HOUR_KST
  ) {
    kst.setUTCDate(
      kst.getUTCDate() - 1,
    );
  }

  return dateKeyFromUtcParts(
    kst,
  );
}


function millisecondsUntilNextServiceRollover(
  now = new Date(),
) {
  const kst =
    new Date(
      now.getTime() +
        KST_OFFSET_MS,
    );

  const next =
    new Date(
      kst.getTime(),
    );

  next.setUTCHours(
    SERVICE_ROLLOVER_HOUR_KST,
    0,
    0,
    0,
  );

  if (
    next.getTime() <=
    kst.getTime()
  ) {
    next.setUTCDate(
      next.getUTCDate() + 1,
    );
  }

  return Math.max(
    1_000,
    next.getTime() -
      kst.getTime() +
      1_000,
  );
}


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

    predictionDate:
      row.prediction_date ??
      null,

    currentMeasuredAt:
      row.current_measured_at,

    behaviorCorrection:
      row.quality_meta
        ?.behavior_correction ??
      null,

    predictionInterval:
      row.quality_meta
        ?.prediction_interval ??
      null,

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

    predictionDate:
      payload.source
        .prediction_date ??
      null,

    currentMeasuredAt:
      payload.current
        .measured_at,

    behaviorCorrection:
      payload.behavior_correction ??
      null,

    predictionInterval:
      payload.prediction_interval ??
      null,

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


function getBehaviorCorrectionDescription(
  correction:
    PredictionBehaviorCorrection | null,
) {
  if (!correction) {
    return '식단 보정 정보를 확인할 수 없어 기본 체성분 예측을 표시합니다.';
  }

  if (correction.applied) {
    return '최근 7일 식단 기록의 탄수화물·지방·단백질 섭취 정보를 사용해 체중과 체지방 예측을 보정했습니다.';
  }

  const gate =
    correction.gate;

  if (
    gate?.reason ===
    'insufficient_recent_meal_days'
  ) {
    const observed =
      gate.observed_meal_days ??
      0;

    const minimum =
      gate.minimum_observed_meal_days ??
      3;

    return `최근 7일 중 식단 기록이 ${observed}일로, 보정에 필요한 ${minimum}일보다 적어 기본 체성분 예측을 그대로 사용했습니다.`;
  }

  return '현재 식단 보정 조건을 충족하지 않아 기본 체성분 예측을 그대로 사용했습니다.';
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
    predictionServiceDate,
    setPredictionServiceDate,
  ] =
    useState(
      () =>
        resolveServicePredictionDate(),
    );

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
    let timeoutId:
      | ReturnType<
          typeof setTimeout
        >
      | null =
      null;

    const scheduleNextRollover =
      () => {
        timeoutId =
          setTimeout(
            () => {
              setPredictionServiceDate(
                resolveServicePredictionDate(),
              );

              scheduleNextRollover();
            },
            millisecondsUntilNextServiceRollover(),
          );
      };

    scheduleNextRollover();

    return () => {
      if (timeoutId) {
        clearTimeout(
          timeoutId,
        );
      }
    };
  }, []);

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
                prediction_date,
                current_measured_at,
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
                quality_meta,
                created_at
              `)
              .eq(
                'user_id',
                user.id,
              )
              .eq(
                'prediction_date',
                predictionServiceDate,
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
            const mappedHistory =
              mapPredictionHistoryRow(
                existingPrediction as
                  PredictionHistoryRow,
              );

            if (
              mappedHistory
                .predictionInterval
            ) {
              if (
                !cancelled
              ) {
                setPrediction(
                  mappedHistory,
                );
              }

              return;
            }
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
                      !existingPrediction,

                    prediction_date:
                      predictionServiceDate,
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
    predictionServiceDate,
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
                    체성분 기록 · 미래 예측
                  </p>

                  <h2 className="mt-2 text-xl font-bold">
                    지난 기록과 미래 예측 범위를
                    함께 확인해보세요
                  </h2>
                </div>

                <span className="flex-shrink-0 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-300">
                  28~35일 후
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                실제 체성분 측정 기록은
                실선으로, 약 한 달 뒤 AI
                예측은 중앙값과 50%·80%
                예측 범위로 구분해 표시합니다.
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
                      records={
                        inbodyRecords.map(
                          (
                            record,
                          ) => ({
                            measured_at:
                              record.measured_at,

                            weight_kg:
                              record.weight_kg,

                            fat_mass_kg:
                              record.body_fat_kg,

                            skeletal_muscle_kg:
                              record.skeletal_muscle_kg,

                            body_fat_pct:
                              record.body_fat_pct,
                          }),
                        )
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
                    실선과 점은 실제 체성분
                    측정 기록입니다. 오른쪽
                    ◆ 표시는 AI의 28~35일 후
                    중앙 예측값이며, 음영은
                    과거 내부 검증 오차 분포를
                    바탕으로 계산한 50%·80%
                    예측 범위입니다.
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
                    prediction
                      ?.currentMeasuredAt ??
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
              체성분 측정 기록을 기본으로
              사용합니다. 최근 식단 기록이
              보정 조건을 충족하면
              탄수화물·지방·단백질 정보를
              체중·체지방 예측에 추가
              반영하며, 운동 기록은 최근
              활동 요약으로만 표시합니다.
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
                  prediction.currentMeasuredAt,
                )} 측정값을 현재 상태의 기준으로 사용했습니다.`}
              />

              <InsightRow
                title="최근 식단 기록"
                description={
                  getBehaviorCorrectionDescription(
                    prediction.behaviorCorrection,
                  )
                }
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
  records,
}: {
  prediction:
    PredictionData;

  metricKey:
    PredictionMetricKey;

  records:
    PredictionChartRecord[];
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

  const predictedValue =
    prediction.prediction[
      metricKey
    ];

  const intervalMetric =
    prediction
      .predictionInterval
      ?.metrics[
        metricKey
      ] ??
    null;

  const interval80 =
    intervalMetric
      ?.intervals[
        '0.80'
      ] ??
    intervalMetric
      ?.default_interval ??
    null;

  const interval50 =
    intervalMetric
      ?.intervals[
        '0.50'
      ] ??
    null;

  const anchorTime =
    new Date(
      prediction.currentMeasuredAt,
    ).getTime();

  const sortedActuals =
    records
      .filter(
        (
          record,
        ) => {
          const time =
            new Date(
              record.measured_at,
            ).getTime();

          const value =
            record[
              metricKey
            ];

          return (
            Number.isFinite(
              time,
            ) &&
            Number.isFinite(
              value,
            ) &&
            (
              !Number.isFinite(
                anchorTime,
              ) ||
              time <=
                anchorTime
            )
          );
        },
      )
      .sort(
        (
          a,
          b,
        ) =>
          new Date(
            a.measured_at,
          ).getTime() -
          new Date(
            b.measured_at,
          ).getTime(),
      )
      .slice(-6);

  const hasAnchorRecord =
    sortedActuals.some(
      (
        record,
      ) =>
        record.measured_at ===
        prediction.currentMeasuredAt,
    );

  const actuals =
    hasAnchorRecord
      ? sortedActuals
      : [
          ...sortedActuals,
          {
            measured_at:
              prediction.currentMeasuredAt,

            weight_kg:
              prediction.current
                .weight_kg,

            fat_mass_kg:
              prediction.current
                .fat_mass_kg,

            skeletal_muscle_kg:
              prediction.current
                .skeletal_muscle_kg,

            body_fat_pct:
              prediction.current
                .body_fat_pct,
          },
        ]
          .sort(
            (
              a,
              b,
            ) =>
              new Date(
                a.measured_at,
              ).getTime() -
              new Date(
                b.measured_at,
              ).getTime(),
          )
          .slice(-6);

  const W = 360;
  const H = 225;

  const PAD = {
    top: 22,
    right: 18,
    bottom: 42,
    left: 42,
  };

  const historyStartX =
    PAD.left;

  const anchorX =
    228;

  const dividerX =
    255;

  const futureX =
    314;

  const historySpan =
    Math.max(
      1,
      actuals.length -
        1,
    );

  const actualPoints =
    actuals.map(
      (
        record,
        index,
      ) => ({
        x:
          actuals.length ===
          1
            ? anchorX
            : historyStartX +
              (
                (
                  anchorX -
                  historyStartX
                ) *
                index
              ) /
                historySpan,

        yValue:
          record[
            metricKey
          ],

        measuredAt:
          record.measured_at,

        isAnchor:
          index ===
          actuals.length -
            1,
      }),
    );

  const rangeValues = [
    ...actualPoints.map(
      (
        point,
      ) =>
        point.yValue,
    ),
    predictedValue,
  ];

  if (interval80) {
    rangeValues.push(
      interval80.lower,
      interval80.upper,
    );
  }

  if (interval50) {
    rangeValues.push(
      interval50.lower,
      interval50.upper,
    );
  }

  const rawMin =
    Math.min(
      ...rangeValues,
    );

  const rawMax =
    Math.max(
      ...rangeValues,
    );

  const rawRange =
    rawMax -
    rawMin;

  const minimumPad =
    metric.unit ===
    '%'
      ? 0.6
      : 0.3;

  const padding =
    Math.max(
      minimumPad,
      rawRange *
        0.18,
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
      (
        H -
        PAD.top -
        PAD.bottom
      );

  const yTicks = [
    max,
    (
      max +
      min
    ) /
      2,
    min,
  ];

  const historyPath =
    actualPoints
      .map(
        (
          point,
          index,
        ) =>
          `${
            index ===
            0
              ? 'M'
              : 'L'
          } ${point.x.toFixed(
            1,
          )} ${yOf(
            point.yValue,
          ).toFixed(
            1,
          )}`,
      )
      .join(' ');

  const formatAxisDate = (
    value: string,
  ) => {
    const date =
      new Date(
        value,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return '';
    }

    return `${String(
      date.getMonth() +
        1,
    ).padStart(
      2,
      '0',
    )}.${String(
      date.getDate(),
    ).padStart(
      2,
      '0',
    )}`;
  };

  const labelIndexes =
    new Set<number>();

  if (
    actualPoints.length >
    0
  ) {
    labelIndexes.add(0);
    labelIndexes.add(
      actualPoints.length -
        1,
    );

    if (
      actualPoints.length >=
      4
    ) {
      labelIndexes.add(
        Math.floor(
          (
            actualPoints.length -
            1
          ) /
            2,
        ),
      );
    }
  }

  const futureY =
    yOf(
      predictedValue,
    );

  const interval80Top =
    interval80
      ? yOf(
          interval80.upper,
        )
      : null;

  const interval80Bottom =
    interval80
      ? yOf(
          interval80.lower,
        )
      : null;

  const interval50Top =
    interval50
      ? yOf(
          interval50.upper,
        )
      : null;

  const interval50Bottom =
    interval50
      ? yOf(
          interval50.lower,
        )
      : null;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between px-2">
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
            28~35일 후 AI 예측
          </p>

          <p className="mt-0.5 text-sm font-bold text-blue-300">
            {predictedValue.toFixed(
              1,
            )}
            {metric.unit}
          </p>

          {interval80 && (
            <p className="mt-0.5 text-[9px] text-zinc-500">
              80% 범위{' '}
              {interval80.lower.toFixed(
                1,
              )}
              ~
              {interval80.upper.toFixed(
                1,
              )}
              {metric.unit}
            </p>
          )}
        </div>
      </div>

      <div className="mb-1 flex items-center gap-3 px-2 text-[9px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-300" />
          실제 측정
        </span>

        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 bg-blue-400" />
          AI 예측
        </span>

        {interval50 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm bg-blue-400/30" />
            50%
          </span>
        )}

        {interval80 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm bg-blue-400/15" />
            80%
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{
          maxHeight:
            H,
        }}
        aria-label={`${metric.label} 실제 측정 기록과 미래 예측 범위 그래프`}
      >
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
                  opacity="0.5"
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

        <line
          x1={dividerX}
          y1={
            PAD.top -
            3
          }
          x2={dividerX}
          y2={
            H -
            PAD.bottom +
            5
          }
          stroke="#52525b"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.8"
        />

        <text
          x={
            dividerX +
            4
          }
          y={
            PAD.top +
            8
          }
          fontSize="8"
          fill="#71717a"
        >
          예측
        </text>

        {historyPath && (
          <path
            d={historyPath}
            fill="none"
            stroke="#d4d4d8"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {actualPoints.map(
          (
            point,
            index,
          ) => (
            <g
              key={`${point.measuredAt}-${index}`}
            >
              {point.isAnchor && (
                <circle
                  cx={
                    point.x
                  }
                  cy={
                    yOf(
                      point.yValue,
                    )
                  }
                  r="7"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="1.5"
                  opacity="0.75"
                />
              )}

              <circle
                cx={
                  point.x
                }
                cy={
                  yOf(
                    point.yValue,
                  )
                }
                r={
                  point.isAnchor
                    ? 4
                    : 3
                }
                fill={
                  point.isAnchor
                    ? '#60a5fa'
                    : '#d4d4d8'
                }
              />

              {labelIndexes.has(
                index,
              ) && (
                <text
                  x={
                    point.x
                  }
                  y={
                    H -
                    13
                  }
                  textAnchor={
                    index ===
                    0
                      ? 'start'
                      : point.isAnchor
                        ? 'end'
                        : 'middle'
                  }
                  fontSize="8"
                  fill="#71717a"
                >
                  {point.isAnchor
                    ? '현재'
                    : formatAxisDate(
                        point.measuredAt,
                      )}
                </text>
              )}
            </g>
          ),
        )}

        {interval80 &&
          interval80Top !==
            null &&
          interval80Bottom !==
            null && (
            <rect
              x={
                futureX -
                15
              }
              y={
                interval80Top
              }
              width="30"
              height={
                Math.max(
                  2,
                  interval80Bottom -
                    interval80Top,
                )
              }
              rx="7"
              fill="#60a5fa"
              fillOpacity="0.14"
              stroke="#60a5fa"
              strokeOpacity="0.22"
              strokeWidth="1"
            />
          )}

        {interval50 &&
          interval50Top !==
            null &&
          interval50Bottom !==
            null && (
            <rect
              x={
                futureX -
                9
              }
              y={
                interval50Top
              }
              width="18"
              height={
                Math.max(
                  2,
                  interval50Bottom -
                    interval50Top,
                )
              }
              rx="5"
              fill="#60a5fa"
              fillOpacity="0.32"
            />
          )}

        {interval80 && (
          <line
            x1={futureX}
            y1={
              yOf(
                interval80.lower,
              )
            }
            x2={futureX}
            y2={
              yOf(
                interval80.upper,
              )
            }
            stroke="#60a5fa"
            strokeWidth="1"
            opacity="0.75"
          />
        )}

        <rect
          x={
            futureX -
            4
          }
          y={
            futureY -
            4
          }
          width="8"
          height="8"
          rx="1"
          fill="#60a5fa"
          transform={`rotate(45 ${futureX} ${futureY})`}
        />

        <text
          x={futureX}
          y={
            H -
            13
          }
          textAnchor="middle"
          fontSize="8"
          fill="#60a5fa"
        >
          28~35일 후
        </text>
      </svg>

      {!interval80 && (
        <p className="px-2 pb-1 text-[9px] leading-relaxed text-zinc-600">
          중앙 예측값은 표시되지만,
          현재 저장된 예측에는 예측 범위
          정보가 없습니다.
        </p>
      )}
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

  const interval80 =
    prediction
      .predictionInterval
      ?.metrics[
        metricKey
      ]
      ?.intervals[
        '0.80'
      ] ??
    prediction
      .predictionInterval
      ?.metrics[
        metricKey
      ]
      ?.default_interval ??
    null;

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <TrendSummaryItem
        label="현재"
        value={`${currentValue.toFixed(
          1,
        )}${metric.unit}`}
      />

      <TrendSummaryItem
        label="AI 예측"
        value={`${predictedValue.toFixed(
          1,
        )}${metric.unit}`}
        accent
      />

      <TrendSummaryItem
        label="80% 예측 범위"
        value={
          interval80
            ? `${interval80.lower.toFixed(
                1,
              )}~${interval80.upper.toFixed(
                1,
              )}${metric.unit}`
            : '-'
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
