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
  Sparkles,
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

interface PredictionResponse {
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
  history: {
    history_quality: string;
    history_n_prior: number;
    has_prev: boolean;
    has_prev2: boolean;
    days_since_prev: number | null;
    history_count_30d: number;
    history_count_90d: number;
    history_count_180d: number;
    invalid_history_rows_ignored: number;
    non_past_rows_ignored: number;
    max_prior_time: string | null;
  };
  quality: {
    physical_sanity: string;
    history_available: boolean;
    validation_scope: string;
  };
  source: {
    inbody_record_id: string;
    inbody_records_used: number;
    authenticated_user: boolean;
  };
  prediction_history_id: string | null;
}

const CHART_METRICS: MetricConfig[] = [
  { key: 'weight_kg', label: '체중', color: '#ffffff', unit: 'kg' },
  { key: 'skeletal_muscle_kg', label: '골격근량', color: '#60a5fa', unit: 'kg' },
  { key: 'body_fat_kg', label: '체지방량', color: '#fb7185', unit: 'kg' },
  { key: 'body_fat_pct', label: '체지방률', color: '#f97316', unit: '%' },
  { key: 'body_water_kg', label: '체수분', color: '#22d3ee', unit: 'kg' },
  { key: 'protein_kg', label: '단백질', color: '#818cf8', unit: 'kg' },
  { key: 'mineral_kg', label: '무기질', color: '#f59e0b', unit: 'kg' },
  { key: 'visceral_fat_level', label: '내장지방', color: '#a78bfa', unit: '' },
  { key: 'abdominal_fat_ratio', label: '복부지방률', color: '#facc15', unit: '' },
  { key: 'bmr_kcal', label: '기초대사량', color: '#4ade80', unit: 'kcal' },
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

interface ChartSeries {
  color: string;
  values: (number | null)[];
}

function LineChart({
  records,
  series,
}: {
  records: InbodyRecord[];
  series: ChartSeries[];
}) {
  const W = 340;
  const H = 160;
  const PAD = { top: 12, right: 8, bottom: 24, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = records.length;

  if (n < 2) return null;

  const allValues = series
    .flatMap((item) => item.values)
    .filter((value): value is number => value !== null);

  if (allValues.length === 0) return null;

  const min = Math.floor(Math.min(...allValues) - 1);
  const max = Math.ceil(Math.max(...allValues) + 1);
  const range = Math.max(max - min, 1);

  const xOf = (index: number) =>
    PAD.left + (index / (n - 1)) * innerW;

  const yOf = (value: number) =>
    PAD.top + ((max - value) / range) * innerH;

  const path = (values: (number | null)[]) => {
    let d = '';

    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;

      const command =
        d === '' || values[i - 1] === null ? 'M' : 'L';

      d += `${command} ${xOf(i).toFixed(1)} ${yOf(
        values[i]!,
      ).toFixed(1)} `;
    }

    return d;
  };

  const xLabels = [0, Math.floor((n - 1) / 2), n - 1].filter(
    (value, index, array) =>
      array.indexOf(value) === index && value < n,
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: H }}
    >
      {[0, 0.5, 1].map((t) => {
        const y = PAD.top + t * innerH;
        const value = max - t * range;

        return (
          <g key={t}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="#27272a"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 4}
              y={y + 4}
              textAnchor="end"
              fontSize="9"
              fill="#71717a"
            >
              {value.toFixed(0)}
            </text>
          </g>
        );
      })}

      {xLabels.map((index) => (
        <text
          key={index}
          x={xOf(index)}
          y={H - 4}
          textAnchor="middle"
          fontSize="8"
          fill="#52525b"
        >
          {formatMeasurementDate(
            records[index].measured_at,
          ).slice(5)}
        </text>
      ))}

      {series.map((item, seriesIndex) => (
        <g key={seriesIndex}>
          <path
            d={path(item.values)}
            fill="none"
            stroke={item.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {item.values.map(
            (value, index) =>
              value !== null && (
                <circle
                  key={index}
                  cx={xOf(index)}
                  cy={yOf(value)}
                  r="3"
                  fill={item.color}
                />
              ),
          )}
        </g>
      ))}
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

function PredictionMetric({
  label,
  value,
  delta,
  unit,
  invert = false,
  valueClassName = 'text-zinc-100',
}: {
  label: string;
  value: number;
  delta: number;
  unit: string;
  invert?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3.5">
      <p className="text-[11px] text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-1 text-lg font-bold ${valueClassName}`}
      >
        {value.toFixed(1)}
        <span className="ml-0.5 text-xs font-medium text-zinc-500">
          {unit}
        </span>
      </p>

      <div className="mt-1">
        <DeltaBadge
          value={delta}
          unit={unit}
          invert={invert}
        />
      </div>
    </div>
  );
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

  return detail || 'AI 체성분 예측에 실패했습니다.';
}

function PredictionCard({
  record,
}: {
  record: InbodyRecord;
}) {
  const [result, setResult] =
    useState<PredictionResponse | null>(null);

  const [isPredicting, setIsPredicting] =
    useState(false);

  const [error, setError] =
    useState('');

  useEffect(() => {
    setResult(null);
    setError('');
  }, [record.id]);

  const runPrediction = async () => {
    if (isPredicting || result) return;

    setIsPredicting(true);
    setError('');

    try {
      const supabase =
        createClient();

      const {
        data: { session },
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(
          '로그인 정보를 확인하지 못했습니다.',
        );
      }

      if (!session?.access_token) {
        throw new Error(
          'AI 예측은 로그인한 사용자만 사용할 수 있습니다.',
        );
      }

      const response =
        await fetch('/api/predict', {
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
        });

      let payload:
        | PredictionResponse
        | { detail?: string }
        | null = null;

      try {
        payload =
          await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const detail =
          payload &&
          'detail' in payload &&
          typeof payload.detail === 'string'
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
        !('prediction' in payload)
      ) {
        throw new Error(
          '예측 응답 형식이 올바르지 않습니다.',
        );
      }

      setResult(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'AI 체성분 예측에 실패했습니다.',
      );
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-b from-blue-950/35 to-zinc-900">
      <div className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-500/15">
            <Sparkles
              size={19}
              className="text-blue-400"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-100">
                AI 체성분 예측
              </h2>

              {result && (
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                  {result.model.endpoint_window}
                </span>
              )}
            </div>

            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              누적된 체성분 기록의 변화 패턴을 바탕으로
              약 한 달 뒤 상태를 예측합니다.
            </p>
          </div>
        </div>

        {!result ? (
          <>
            <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] text-zinc-500">
                    현재 기준
                  </p>

                  <p className="mt-1 text-sm font-semibold text-zinc-200">
                    {formatMeasurementDate(
                      record.measured_at,
                    )}{' '}
                    측정 기록
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[11px] text-zinc-500">
                    예측 시점
                  </p>

                  <p className="mt-1 text-sm font-semibold text-blue-300">
                    28~35일 후
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-900/40 bg-red-950/20 p-3.5">
                <AlertCircle
                  size={15}
                  className="mt-0.5 flex-shrink-0 text-red-400"
                />

                <p className="text-xs leading-relaxed text-red-300">
                  {error}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                void runPrediction()
              }
              disabled={isPredicting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPredicting ? (
                <>
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                  />
                  AI가 변화를 분석하는 중...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  한 달 뒤 체성분 예측하기
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <PredictionMetric
                label="예측 체중"
                value={
                  result.prediction.weight_kg
                }
                delta={
                  result.change.weight_kg
                }
                unit="kg"
              />

              <PredictionMetric
                label="예측 골격근량"
                value={
                  result.prediction
                    .skeletal_muscle_kg
                }
                delta={
                  result.change
                    .skeletal_muscle_kg
                }
                unit="kg"
                valueClassName="text-blue-300"
              />

              <PredictionMetric
                label="예측 체지방량"
                value={
                  result.prediction
                    .fat_mass_kg
                }
                delta={
                  result.change
                    .fat_mass_kg
                }
                unit="kg"
                invert
                valueClassName="text-rose-300"
              />

              <PredictionMetric
                label="예측 체지방률"
                value={
                  result.prediction
                    .body_fat_pct
                }
                delta={
                  result.change
                    .body_fat_pct
                }
                unit="%"
                invert
                valueClassName="text-rose-300"
              />
            </div>

            <div className="rounded-2xl bg-zinc-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-zinc-500">
                    분석에 사용된 기록
                  </p>

                  <p className="mt-1 text-sm font-semibold text-zinc-200">
                    {
                      result.source
                        .inbody_records_used
                    }
                    개
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[11px] text-zinc-500">
                    기록 상태
                  </p>

                  <p className="mt-1 text-sm font-semibold text-zinc-200">
                    {result.quality
                      .history_available
                      ? '이전 기록 반영'
                      : '첫 기록 기반'}
                  </p>
                </div>
              </div>

              {result.quality.history_available &&
              result.history.days_since_prev !==
                null ? (
                <p className="mt-3 border-t border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-500">
                  직전 측정은{' '}
                  <span className="font-medium text-zinc-300">
                    {
                      result.history
                        .days_since_prev
                    }
                    일 전
                  </span>
                  이며, 이전 기록{' '}
                  <span className="font-medium text-zinc-300">
                    {
                      result.history
                        .history_n_prior
                    }
                    개
                  </span>
                  를 변화 패턴 분석에
                  활용했습니다.
                </p>
              ) : (
                <p className="mt-3 border-t border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-500">
                  아직 이전 측정 기록이 없어 현재
                  체성분을 기준으로 예측했습니다.
                  기록이 쌓일수록 개인의 변화 흐름을
                  더 많이 반영할 수 있습니다.
                </p>
              )}
            </div>

            <div className="mt-4 flex items-start gap-2">
              <AlertCircle
                size={13}
                className="mt-0.5 flex-shrink-0 text-zinc-600"
              />

              <p className="text-[11px] leading-relaxed text-zinc-600">
                AI 예측은 현재까지의 체성분
                기록을 기반으로 한 참고 정보이며
                실제 변화와 차이가 발생할 수
                있습니다.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
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
    selectedMetrics,
    setSelectedMetrics,
  ] = useState<Set<string>>(
    new Set([
      'weight_kg',
      'skeletal_muscle_kg',
      'body_fat_kg',
    ]),
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

  const toggleMetric = (
    key: string,
  ) => {
    setSelectedMetrics(
      (previous) => {
        const next =
          new Set(previous);

        if (next.has(key)) {
          if (next.size <= 1) {
            return previous;
          }

          next.delete(key);
        } else {
          next.add(key);
        }

        return next;
      },
    );
  };

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

  const chartSeries:
    ChartSeries[] =
    CHART_METRICS.filter(
      (metric) =>
        selectedMetrics.has(
          metric.key,
        ),
    ).map((metric) => ({
      color: metric.color,

      values: records.map(
        (record) => {
          const value =
            record[
              metric.key
            ] as
              | number
              | undefined
              | null;

          return value !==
            undefined &&
            value !== null
            ? value
            : null;
        },
      ),
    }));

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between px-4 pb-4 pt-12">
        <h1 className="text-xl font-bold">
          인바디
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
            인바디 기록이 없습니다
          </p>

          <p className="mb-5 text-xs text-zinc-600">
            인바디 측정 결과를 입력해 체성분
            추이와 AI 예측을 확인하세요.
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
          {records.length >= 2 && (
            <div className="mx-4 mb-5 rounded-2xl bg-zinc-900 p-4">
              <h2 className="mb-3 text-sm font-semibold">
                체성분 추이
              </h2>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {CHART_METRICS.map(
                  (metric) => {
                    const active =
                      selectedMetrics.has(
                        metric.key,
                      );

                    const hasData =
                      records.some(
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
                            value !== null
                          );
                        },
                      );

                    return (
                      <button
                        key={
                          metric.key
                        }
                        type="button"
                        onClick={() =>
                          toggleMetric(
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
                        className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors ${
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

              <LineChart
                records={records}
                series={chartSeries}
              />
            </div>
          )}

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

          {latestRecord && (
            <div className="mx-4 mb-5">
              <PredictionCard
                record={latestRecord}
              />
            </div>
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