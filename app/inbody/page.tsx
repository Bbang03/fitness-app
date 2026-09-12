'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import {
  AlertCircle,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { InbodyRecord } from '@/lib/types';

type NumericInbodyKey =
  | 'weight_kg'
  | 'skeletal_muscle_kg'
  | 'body_fat_kg'
  | 'body_fat_pct'
  | 'body_water_kg'
  | 'protein_kg'
  | 'mineral_kg'
  | 'visceral_fat_level'
  | 'abdominal_fat_ratio'
  | 'bmr_kcal';

interface MetricConfig {
  key: NumericInbodyKey;
  label: string;
  color: string;
  unit: string;
}

const CHART_COLOR = '#dc2626';

const CHART_METRICS: MetricConfig[] = [
  { key: 'weight_kg', label: '체중', color: CHART_COLOR, unit: 'kg' },
  { key: 'skeletal_muscle_kg', label: '골격근량', color: CHART_COLOR, unit: 'kg' },
  { key: 'body_fat_kg', label: '체지방량', color: CHART_COLOR, unit: 'kg' },
  { key: 'body_fat_pct', label: '체지방률', color: CHART_COLOR, unit: '%' },
  { key: 'abdominal_fat_ratio', label: '복부지방률', color: CHART_COLOR, unit: '' },
  { key: 'bmr_kcal', label: '기초대사량', color: CHART_COLOR, unit: 'kcal' },
];

function formatMeasurementDate(value: string) {
  return value.includes('T') ? value.slice(0, 10) : value;
}

function classifyBodyType(
  sex: 'male' | 'female',
  weightKg: number,
  skeletalMuscleKg: number,
  bodyFatPct: number,
) {
  const smmPct = (skeletalMuscleKg / weightKg) * 100;
  const stdSmmLow = sex === 'male' ? 32 : 23;
  const stdSmmHigh = sex === 'male' ? 36 : 27;
  const stdBfHigh = sex === 'male' ? 20 : 28;

  const smmAbove = smmPct >= stdSmmHigh;
  const smmBelow = smmPct < stdSmmLow;
  const fatAbove = bodyFatPct > stdBfHigh;

  if (smmAbove && !fatAbove) {
    return {
      type: 'D' as const,
      label: 'D형',
      desc: '근육형',
      color: 'text-blue-400',
      bg: 'bg-blue-900/40',
    };
  }

  if (fatAbove || smmBelow) {
    return {
      type: 'C' as const,
      label: 'C형',
      desc: '비만형',
      color: 'text-rose-400',
      bg: 'bg-rose-900/40',
    };
  }

  return {
    type: 'I' as const,
    label: 'I형',
    desc: '표준형',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/40',
  };
}

function metricMinimumPadding(
  metric: MetricConfig,
) {
  if (metric.key === 'bmr_kcal') {
    return 30;
  }

  if (
    metric.key ===
    'abdominal_fat_ratio'
  ) {
    return 0.02;
  }

  if (
    metric.key ===
    'visceral_fat_level'
  ) {
    return 0.5;
  }

  if (metric.unit === '%') {
    return 0.5;
  }

  return 0.2;
}

function metricTickDigits(
  metric: MetricConfig,
  range: number,
) {
  if (metric.key === 'bmr_kcal') {
    return 0;
  }

  if (
    metric.key ===
    'abdominal_fat_ratio'
  ) {
    return 2;
  }

  if (
    metric.key ===
    'visceral_fat_level'
  ) {
    return 1;
  }

  return range < 4 ? 1 : 0;
}

function LineChart({
  records,
  metric,
}: {
  records: InbodyRecord[];
  metric: MetricConfig;
}) {
  const W = 340;
  const H = 176;
  const PAD = {
    top: 18,
    right: 10,
    bottom: 26,
    left: 46,
  };

  const innerW =
    W - PAD.left - PAD.right;

  const innerH =
    H - PAD.top - PAD.bottom;

  const values = records.map(
    (record) => {
      const value =
        record[metric.key] as
          | number
          | undefined
          | null;

      return value !== undefined &&
        value !== null &&
        Number.isFinite(value)
        ? value
        : null;
    },
  );

  const validValues =
    values.filter(
      (value): value is number =>
        value !== null,
    );

  if (
    records.length < 2 ||
    validValues.length < 2
  ) {
    return null;
  }

  const rawMin =
    Math.min(...validValues);

  const rawMax =
    Math.max(...validValues);

  const rawRange =
    rawMax - rawMin;

  const minimumPadding =
    metricMinimumPadding(metric);

  const padding =
    rawRange === 0
      ? minimumPadding
      : Math.max(
          rawRange * 0.35,
          minimumPadding,
        );

  let min =
    rawMin - padding;

  let max =
    rawMax + padding;

  if (
    metric.key ===
      'visceral_fat_level' ||
    metric.key ===
      'abdominal_fat_ratio' ||
    metric.unit === '%' ||
    metric.unit === 'kg' ||
    metric.unit === 'kcal'
  ) {
    min = Math.max(0, min);
  }

  if (max <= min) {
    max = min + 1;
  }

  const range = max - min;
  const n = records.length;

  const xOf = (index: number) =>
    PAD.left +
    (index / (n - 1)) * innerW;

  const yOf = (value: number) =>
    PAD.top +
    ((max - value) / range) *
      innerH;

  let path = '';

  values.forEach(
    (value, index) => {
      if (value === null) {
        return;
      }

      const previousExists =
        index > 0 &&
        values[index - 1] !== null;

      const command =
        path === '' ||
        !previousExists
          ? 'M'
          : 'L';

      path +=
        `${command} ` +
        `${xOf(index).toFixed(1)} ` +
        `${yOf(value).toFixed(1)} `;
    },
  );

  const xLabels = [
    0,
    Math.floor((n - 1) / 2),
    n - 1,
  ].filter(
    (value, index, array) =>
      array.indexOf(value) === index &&
      value < n,
  );

  const tickDigits =
    metricTickDigits(metric, range);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: H }}
      aria-label={`${metric.label} 변화 그래프`}
      role="img"
    >
      {[0, 1 / 3, 2 / 3, 1].map(
        (ratio) => {
          const y =
            PAD.top +
            ratio * innerH;

          const value =
            max - ratio * range;

          return (
            <g key={ratio}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="#27272a"
                strokeWidth="1"
              />

              <text
                x={PAD.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="9"
                fill="#71717a"
              >
                {value.toFixed(
                  tickDigits,
                )}
              </text>
            </g>
          );
        },
      )}

      {xLabels.map((index) => (
        <text
          key={index}
          x={xOf(index)}
          y={H - 5}
          textAnchor="middle"
          fontSize="8"
          fill="#52525b"
        >
          {formatMeasurementDate(
            records[index].measured_at,
          ).slice(5)}
        </text>
      ))}

      <path
        d={path}
        fill="none"
        stroke={metric.color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {values.map(
        (value, index) =>
          value !== null && (
            <circle
              key={index}
              cx={xOf(index)}
              cy={yOf(value)}
              r="3.5"
              fill={metric.color}
            />
          ),
      )}
    </svg>
  );
}

function DeltaBadge({
  value,
  unit = 'kg',
  invert = false,
}: {
  value: number;
  unit?: string;
  invert?: boolean;
}) {
  const positive = invert ? value < 0 : value > 0;

  const color =
    value === 0
      ? 'text-zinc-400'
      : positive
        ? 'text-emerald-400'
        : 'text-rose-400';

  const Icon =
    value === 0
      ? Minus
      : value > 0
        ? TrendingUp
        : TrendingDown;

  const sign = value > 0 ? '+' : '';

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}
    >
      <Icon size={11} />
      {sign}
      {value.toFixed(1)}
      {unit}
    </span>
  );
}

const predictionRequestCache =
  new Map<string, Promise<void>>();

function AutoPredictionSync({
  record,
}: {
  record: InbodyRecord;
}) {
  useEffect(() => {
    let cancelled = false;

    const ensurePrediction = async () => {
      try {
        const supabase = createClient();

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (
          sessionError ||
          !session?.access_token ||
          cancelled
        ) {
          return;
        }

        const {
          data: existingPrediction,
          error: existingError,
        } = await supabase
          .from('prediction_history')
          .select('id')
          .eq(
            'source_inbody_id',
            record.id,
          )
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (existingError) {
          console.error(
            'Prediction history lookup failed:',
            existingError.message,
          );
          return;
        }

        if (existingPrediction) {
          return;
        }

        let request =
          predictionRequestCache.get(
            record.id,
          );

        if (!request) {
          request = fetch(
            '/api/predict',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                save_prediction: true,
              }),
              cache: 'no-store',
            },
          ).then(async (response) => {
            if (!response.ok) {
              let detail = '';

              try {
                const payload =
                  (await response.json()) as {
                    detail?: string;
                  };

                detail =
                  payload.detail ?? '';
              } catch {
                detail = '';
              }

              throw new Error(
                detail ||
                  `Prediction request failed (${response.status})`,
              );
            }
          });

          predictionRequestCache.set(
            record.id,
            request,
          );
        }

        await request;
      } catch (error) {
        console.error(
          'Automatic body composition prediction failed:',
          error,
        );
      }
    };

    void ensurePrediction();

    return () => {
      cancelled = true;
    };
  }, [record.id]);

  return null;
}

export default function InbodyPage() {
  const router =
    useRouter();

  const {
    currentUser,
    loadInbodyRecords,
    getInbodyRecords,
    deleteInbodyRecord,
  } = useStore();

  const user =
    currentUser();

  const [
    selectedMetric,
    setSelectedMetric,
  ] =
    useState<NumericInbodyKey>(
      'weight_kg',
    );

  const [
    isHydrating,
    setIsHydrating,
  ] = useState(true);

  const [
    syncError,
    setSyncError,
  ] = useState('');

  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    const hydrate =
      async () => {
        setIsHydrating(true);
        setSyncError('');

        const ok =
          await loadInbodyRecords();

        if (cancelled) return;

        if (!ok) {
          setSyncError(
            '체성분 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
          );
        }

        setIsHydrating(false);
      };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    router,
    loadInbodyRecords,
  ]);

  const records =
    getInbodyRecords();

  if (!user) {
    return null;
  }

  const latestRecord =
    records.at(-1) ?? null;

  const previousRecord =
    records.length >= 2
      ? records.at(-2) ?? null
      : null;

  const bodyType =
    latestRecord
      ? classifyBodyType(
          user.sex,
          latestRecord.weight_kg,
          latestRecord
            .skeletal_muscle_kg,
          latestRecord.body_fat_pct,
        )
      : null;

  const handleDelete =
    async (id: string) => {
      if (deletingId) return;

      setDeletingId(id);
      setSyncError('');

      const ok =
        await deleteInbodyRecord(id);

      if (!ok) {
        setSyncError(
          '체성분 기록을 삭제하지 못했습니다.',
        );
      }

      setDeletingId(null);
    };

  const selectedMetricConfig =
    CHART_METRICS.find(
      (metric) =>
        metric.key === selectedMetric,
    ) ?? CHART_METRICS[0];

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between px-4 pb-4 pt-12">
        <h1 className="text-xl font-bold">
          체성분 분석
        </h1>

        <Link
          href="/inbody/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <Plus size={16} />
          기록 추가
        </Link>
      </div>

      {syncError && (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-2xl border border-red-900/40 bg-red-950/20 p-3.5">
          <AlertCircle
            size={15}
            className="mt-0.5 flex-shrink-0 text-red-400"
          />

          <p className="text-xs leading-relaxed text-red-300">
            {syncError}
          </p>
        </div>
      )}

      {isHydrating ? (
        <div className="mx-4 flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 p-10 text-sm text-zinc-500">
          <RefreshCw
            size={15}
            className="animate-spin"
          />
          체성분 기록을 불러오는 중...
        </div>
      ) : records.length === 0 ? (
        <div className="mx-4 rounded-2xl bg-zinc-900 p-10 text-center">
          <p className="mb-2 text-sm text-zinc-400">
            체성분 기록이 없습니다
          </p>

          <p className="mb-5 text-xs text-zinc-600">
            체성분 측정 결과를 입력해 변화 추이를
            확인하세요.
          </p>

          <Link
            href="/inbody/new"
            className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white"
          >
            첫 기록 추가
          </Link>
        </div>
      ) : (
        <>
          {latestRecord && (
            <div className="mx-4 mb-5 rounded-2xl bg-zinc-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">
                    최근 측정
                  </h2>

                  {bodyType && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${bodyType.color} ${bodyType.bg}`}
                    >
                      {bodyType.label}{' '}
                      {bodyType.desc}
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-500">
                  {formatMeasurementDate(
                    latestRecord.measured_at,
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {[
                  {
                    label: '체중',

                    value:
                      `${latestRecord.weight_kg}kg`,

                    color:
                      'text-white',

                    delta:
                      previousRecord
                        ? latestRecord.weight_kg -
                          previousRecord.weight_kg
                        : null,

                    unit: 'kg',

                    invert: false,
                  },

                  {
                    label: '골격근',

                    value:
                      `${latestRecord.skeletal_muscle_kg}kg`,

                    color:
                      'text-blue-400',

                    delta:
                      previousRecord
                        ? latestRecord
                            .skeletal_muscle_kg -
                          previousRecord
                            .skeletal_muscle_kg
                        : null,

                    unit: 'kg',

                    invert: false,
                  },

                  {
                    label: '체지방%',

                    value:
                      `${latestRecord.body_fat_pct}%`,

                    color:
                      'text-rose-400',

                    delta:
                      previousRecord
                        ? latestRecord.body_fat_pct -
                          previousRecord.body_fat_pct
                        : null,

                    unit: '%',

                    invert: true,
                  },

                  {
                    label: '체지방량',

                    value:
                      `${latestRecord.body_fat_kg.toFixed(
                        1,
                      )}kg`,

                    color:
                      'text-rose-300',

                    delta:
                      previousRecord
                        ? latestRecord.body_fat_kg -
                          previousRecord.body_fat_kg
                        : null,

                    unit: 'kg',

                    invert: true,
                  },
                ].map(
                  ({
                    label,
                    value,
                    color,
                    delta,
                    unit,
                    invert,
                  }) => (
                    <div
                      key={label}
                      className="rounded-xl bg-zinc-800 px-2 py-3"
                    >
                      <p
                        className={`text-sm font-bold ${color}`}
                      >
                        {value}
                      </p>

                      {delta !==
                        null && (
                        <div className="mt-1 flex justify-center">
                          <DeltaBadge
                            value={delta}
                            unit={unit}
                            invert={
                              invert
                            }
                          />
                        </div>
                      )}

                      <p className="mt-1 text-[10px] text-zinc-500">
                        {label}
                      </p>
                    </div>
                  ),
                )}
              </div>

              {(() => {
                const options = [
                  {
                    label:
                      '체수분',

                    value:
                      latestRecord
                        .body_water_kg,

                    fmt: (
                      value: number,
                    ) =>
                      `${value}kg`,

                    color:
                      'text-cyan-400',
                  },

                  {
                    label:
                      '기초대사량',

                    value:
                      latestRecord
                        .bmr_kcal,

                    fmt: (
                      value: number,
                    ) =>
                      `${value}kcal`,

                    color:
                      'text-green-400',
                  },

                  {
                    label:
                      '단백질',

                    value:
                      latestRecord
                        .protein_kg,

                    fmt: (
                      value: number,
                    ) =>
                      `${value}kg`,

                    color:
                      'text-indigo-400',
                  },

                  {
                    label:
                      '무기질',

                    value:
                      latestRecord
                        .mineral_kg,

                    fmt: (
                      value: number,
                    ) =>
                      `${value}kg`,

                    color:
                      'text-amber-400',
                  },

                  {
                    label:
                      '복부지방률',

                    value:
                      latestRecord
                        .abdominal_fat_ratio,

                    fmt: (
                      value: number,
                    ) =>
                      `${value}`,

                    color:
                      'text-yellow-400',
                  },

                  {
                    label:
                      '내장지방',

                    value:
                      latestRecord
                        .visceral_fat_level,

                    fmt: (
                      value: number,
                    ) =>
                      `Lv.${value}`,

                    color:
                      'text-purple-400',
                  },
                ].filter(
                  (option) =>
                    option.value !==
                      undefined &&
                    option.value !==
                      null,
                );

                if (
                  options.length === 0
                ) {
                  return null;
                }

                return (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {options.map(
                      ({
                        label,
                        value,
                        fmt,
                        color,
                      }) => (
                        <div
                          key={label}
                          className="rounded-xl bg-zinc-800/60 py-2"
                        >
                          <p
                            className={`text-xs font-bold ${color}`}
                          >
                            {fmt(
                              value as number,
                            )}
                          </p>

                          <p className="mt-0.5 text-[10px] text-zinc-500">
                            {label}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {records.length >= 2 && (
            <div className="mx-4 mb-5 rounded-2xl bg-zinc-900 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">
                  체성분 추이
                </h2>
              </div>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {CHART_METRICS.map(
                  (metric) => {
                    const active =
                      selectedMetric ===
                      metric.key;

                    const dataCount =
                      records.filter(
                        (record) => {
                          const value =
                            record[
                              metric.key
                            ] as
                              | number
                              | undefined
                              | null;

                          return (
                            value !==
                              undefined &&
                            value !== null &&
                            Number.isFinite(
                              value,
                            )
                          );
                        },
                      ).length;

                    const hasData =
                      dataCount >= 2;

                    return (
                      <button
                        key={
                          metric.key
                        }
                        type="button"
                        onClick={() =>
                          setSelectedMetric(
                            metric.key,
                          )
                        }
                        disabled={!hasData}
                        style={
                          active
                            ? {
                                borderColor:
                                  metric.color,

                                color:
                                  metric.color,

                                backgroundColor:
                                  `${metric.color}22`,
                              }
                            : {}
                        }
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] transition-colors ${
                          !hasData
                            ? 'cursor-default border-zinc-800 text-zinc-700'
                            : active
                              ? 'font-semibold'
                              : 'border-zinc-700 text-zinc-500'
                        }`}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              hasData
                                ? active
                                  ? metric.color
                                  : '#52525b'
                                : '#3f3f46',
                          }}
                        />

                        {metric.label}
                      </button>
                    );
                  },
                )}
              </div>

              <div className="mb-2 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] text-zinc-500">
                    선택 항목
                  </p>

                  <p
                    className="mt-0.5 text-sm font-semibold"
                    style={{
                      color:
                        selectedMetricConfig.color,
                    }}
                  >
                    {
                      selectedMetricConfig.label
                    }
                  </p>
                </div>

                {(() => {
                  const latestValue =
                    latestRecord?.[
                      selectedMetricConfig.key
                    ] as
                      | number
                      | undefined
                      | null;

                  const previousValue =
                    previousRecord?.[
                      selectedMetricConfig.key
                    ] as
                      | number
                      | undefined
                      | null;

                  if (
                    latestValue ===
                      undefined ||
                    latestValue === null
                  ) {
                    return null;
                  }

                  return (
                    <div className="text-right">
                      <p className="text-[11px] text-zinc-500">
                        최근 값
                      </p>

                      <div className="mt-0.5 flex items-center justify-end gap-2">
                        <p className="text-sm font-bold text-zinc-200">
                          {latestValue.toFixed(
                            selectedMetricConfig.key ===
                              'bmr_kcal'
                              ? 0
                              : selectedMetricConfig.key ===
                                  'abdominal_fat_ratio'
                                ? 2
                                : 1,
                          )}
                          {
                            selectedMetricConfig.unit
                          }
                        </p>

                        {previousValue !==
                          undefined &&
                          previousValue !==
                            null && (
                          <DeltaBadge
                            value={
                              latestValue -
                              previousValue
                            }
                            unit={
                              selectedMetricConfig.unit
                            }
                            invert={
                              selectedMetricConfig.key ===
                                'body_fat_kg' ||
                              selectedMetricConfig.key ===
                                'body_fat_pct'
                            }
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <LineChart
                records={records}
                metric={
                  selectedMetricConfig
                }
              />
            </div>
          )}

          {latestRecord && (
            <AutoPredictionSync
              record={latestRecord}
            />
          )}

          <div className="px-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-300">
              전체 기록
            </h2>

            <div className="space-y-2">
              {[...records]
                .reverse()
                .map(
                  (
                    record,
                    index,
                  ) => {
                    const originalIndex =
                      records.indexOf(
                        record,
                      );

                    const previous =
                      records[
                        originalIndex -
                          1
                      ];

                    const bodyTypeForRecord =
                      classifyBodyType(
                        user.sex,
                        record.weight_kg,
                        record
                          .skeletal_muscle_kg,
                        record.body_fat_pct,
                      );

                    return (
                      <div
                        key={record.id}
                        className="flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <p className="text-sm font-semibold">
                              {formatMeasurementDate(
                                record.measured_at,
                              )}
                            </p>

                            {index ===
                              0 && (
                              <span className="rounded-full bg-blue-900/50 px-1.5 py-0.5 text-[10px] text-blue-300">
                                최신
                              </span>
                            )}

                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${bodyTypeForRecord.color} ${bodyTypeForRecord.bg}`}
                            >
                              {
                                bodyTypeForRecord.label
                              }
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            <span>
                              {
                                record.weight_kg
                              }
                              kg
                            </span>

                            <span className="text-blue-400">
                              근육{' '}
                              {
                                record
                                  .skeletal_muscle_kg
                              }
                              kg
                            </span>

                            <span className="text-rose-400">
                              지방{' '}
                              {
                                record.body_fat_pct
                              }
                              %
                            </span>

                            {previous && (
                              <DeltaBadge
                                value={
                                  record.weight_kg -
                                  previous.weight_kg
                                }
                                invert={
                                  false
                                }
                              />
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void handleDelete(
                              record.id,
                            )
                          }
                          disabled={
                            deletingId ===
                            record.id
                          }
                          className="flex-shrink-0 p-1.5 text-zinc-600 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`${formatMeasurementDate(
                            record.measured_at,
                          )} 체성분 기록 삭제`}
                        >
                          {deletingId ===
                          record.id ? (
                            <RefreshCw
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            <Trash2
                              size={14}
                            />
                          )}
                        </button>
                      </div>
                    );
                  },
                )}
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}