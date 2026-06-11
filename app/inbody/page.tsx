'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import BottomNav from '@/components/BottomNav';
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { predict } from '@/lib/prediction';
import type { InbodyRecord } from '@/lib/types';

// ── Metric config ──────────────────────────────────────────────────────────

type NumericInbodyKey =
  | 'weight_kg' | 'skeletal_muscle_kg' | 'body_fat_kg' | 'body_fat_pct'
  | 'body_water_kg' | 'protein_kg' | 'mineral_kg'
  | 'visceral_fat_level' | 'abdominal_fat_ratio' | 'bmr_kcal';

interface MetricConfig { key: NumericInbodyKey; label: string; color: string; unit: string; defaultOn: boolean }

const CHART_METRICS: MetricConfig[] = [
  { key: 'weight_kg',           label: '체중',      color: '#ffffff', unit: 'kg',    defaultOn: true  },
  { key: 'skeletal_muscle_kg',  label: '골격근량',   color: '#60a5fa', unit: 'kg',    defaultOn: true  },
  { key: 'body_fat_kg',         label: '체지방량',   color: '#fb7185', unit: 'kg',    defaultOn: true  },
  { key: 'body_fat_pct',        label: '체지방률',   color: '#f97316', unit: '%',     defaultOn: false },
  { key: 'body_water_kg',       label: '체수분',     color: '#22d3ee', unit: 'kg',    defaultOn: false },
  { key: 'protein_kg',          label: '단백질',     color: '#818cf8', unit: 'kg',    defaultOn: false },
  { key: 'mineral_kg',          label: '무기질',     color: '#f59e0b', unit: 'kg',    defaultOn: false },
  { key: 'visceral_fat_level',  label: '내장지방',   color: '#a78bfa', unit: '',      defaultOn: false },
  { key: 'abdominal_fat_ratio', label: '복부지방률', color: '#facc15', unit: '',      defaultOn: false },
  { key: 'bmr_kcal',            label: '기초대사량', color: '#4ade80', unit: 'kcal',  defaultOn: false },
];

// ── Body type classifier ───────────────────────────────────────────────────

function classifyBodyType(
  sex: 'male' | 'female',
  weight_kg: number,
  skeletal_muscle_kg: number,
  body_fat_pct: number,
) {
  const smm_pct = (skeletal_muscle_kg / weight_kg) * 100;
  // Standard SMM %: male 32–36%, female 23–27%
  const stdSmmLow  = sex === 'male' ? 32 : 23;
  const stdSmmHigh = sex === 'male' ? 36 : 27;
  // Standard BF upper bound: male 20%, female 28%
  const stdBfHigh  = sex === 'male' ? 20 : 28;

  const smmAbove = smm_pct >= stdSmmHigh;
  const smmBelow = smm_pct <  stdSmmLow;
  const fatAbove = body_fat_pct > stdBfHigh;

  if (smmAbove && !fatAbove) return { type: 'D' as const, label: 'D형', desc: '근육형',  color: 'text-blue-400',    bg: 'bg-blue-900/40'    };
  if (fatAbove || smmBelow)  return { type: 'C' as const, label: 'C형', desc: '비만형',  color: 'text-rose-400',    bg: 'bg-rose-900/40'    };
                              return { type: 'I' as const, label: 'I형', desc: '표준형',  color: 'text-emerald-400', bg: 'bg-emerald-900/40' };
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────

interface ChartSeries { color: string; values: (number | null)[] }

function LineChart({ records, series }: { records: InbodyRecord[]; series: ChartSeries[] }) {
  const W = 340, H = 160, PAD = { top: 12, right: 8, bottom: 24, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = records.length;
  if (n < 2) return null;

  const allValues = series.flatMap(s => s.values).filter((v): v is number => v !== null);
  if (allValues.length === 0) return null;
  const min = Math.floor(Math.min(...allValues) - 1);
  const max = Math.ceil(Math.max(...allValues) + 1);

  const xOf = (i: number) => PAD.left + (i / (n - 1)) * innerW;
  const yOf = (v: number) => PAD.top + ((max - v) / (max - min)) * innerH;

  const path = (vals: (number | null)[]) => {
    let d = '';
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === null) continue;
      const cmd = d === '' || vals[i - 1] === null ? 'M' : 'L';
      d += `${cmd} ${xOf(i).toFixed(1)} ${yOf(vals[i]!).toFixed(1)} `;
    }
    return d;
  };

  const xLabels = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i && v < n);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      {[0, 0.5, 1].map(t => {
        const y = PAD.top + t * innerH;
        const val = max - t * (max - min);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#27272a" strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#71717a">{val.toFixed(0)}</text>
          </g>
        );
      })}
      {xLabels.map(i => (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="#52525b">
          {records[i].measured_at.slice(5)}
        </text>
      ))}
      {series.map((s, si) => (
        <g key={si}>
          <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          {s.values.map((v, i) => v !== null && (
            <circle key={i} cx={xOf(i)} cy={yOf(v)} r="3" fill={s.color} />
          ))}
        </g>
      ))}
    </svg>
  );
}

// ── Delta badge ────────────────────────────────────────────────────────────

function DeltaBadge({ value, unit = 'kg', invert = false }: { value: number; unit?: string; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const color = value === 0 ? 'text-zinc-400' : positive ? 'text-emerald-400' : 'text-rose-400';
  const Icon = value === 0 ? Minus : value > 0 ? TrendingUp : TrendingDown;
  const sign = value > 0 ? '+' : '';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon size={11} />
      {sign}{value.toFixed(1)}{unit}
    </span>
  );
}

// ── Prediction Card ────────────────────────────────────────────────────────

function PredictionCard({ record, avgKcal, avgProtein, weeklyVolume, user }: {
  record: InbodyRecord;
  avgKcal: number;
  avgProtein: number;
  weeklyVolume: number;
  user: { height_cm: number; sex: 'male' | 'female'; birth_year: number };
}) {
  const result = predict({ user, latestInbody: record, avgDailyKcal: avgKcal, avgDailyProtein_g: avgProtein, weeklyVolume_kg: weeklyVolume, days: 30 });
  const noData = avgKcal === 0 && weeklyVolume === 0;

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">다음 달 예측</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          result.confidence === 'high'   ? 'bg-emerald-900/60 text-emerald-300' :
          result.confidence === 'medium' ? 'bg-amber-900/60 text-amber-300'     :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {result.confidence === 'high' ? '신뢰도 높음' : result.confidence === 'medium' ? '신뢰도 보통' : '신뢰도 낮음'}
        </span>
      </div>

      {noData && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-amber-900/20 border border-amber-700/30 rounded-xl">
          <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">식단과 운동 기록을 추가하면 더 정확한 예측을 제공합니다.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: '예측 체중', predicted: result.predictedWeight_kg,  delta: result.deltaWeight_kg,                              color: 'text-white',    invert: false             },
          { label: '골격근량',  predicted: result.predictedSkeletal_kg, delta: result.deltaSkeletal_kg,                            color: 'text-blue-400', invert: false             },
          { label: '체지방률',  predicted: result.predictedBodyFatPct,  delta: result.predictedBodyFatPct - record.body_fat_pct,   color: 'text-rose-400', invert: true,  unit: '%'  },
        ].map(({ label, predicted, delta, color, invert, unit = 'kg' }) => (
          <div key={label} className="bg-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-base font-bold ${color}`}>{predicted}{unit}</p>
            <DeltaBadge value={delta} unit={unit} invert={invert} />
            <p className="text-[10px] text-zinc-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: '기초대사량', value: `${result.bmr}kcal` },
          { label: 'TDEE',       value: `${result.tdee}kcal` },
          { label: '칼로리 수지', value: `${result.caloricBalance > 0 ? '+' : ''}${result.caloricBalance}kcal` },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs font-medium text-zinc-300">{value}</p>
            <p className="text-[10px] text-zinc-600">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function InbodyPage() {
  const router = useRouter();
  const { currentUser, getInbodyRecords, deleteInbodyRecord, getMealsByDate, workoutLogs } = useStore();
  const user = currentUser();

  useEffect(() => { if (!user) router.replace('/login'); }, [user, router]);

  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(['weight_kg', 'skeletal_muscle_kg', 'body_fat_kg']),
  );

  const records = getInbodyRecords();

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const { avgKcal, avgProtein } = useMemo(() => {
    if (!user) return { avgKcal: 0, avgProtein: 0 };
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    });
    let totalKcal = 0, totalProtein = 0, daysWithData = 0;
    for (const day of days) {
      const logs = getMealsByDate(day);
      if (logs.length > 0) {
        daysWithData++;
        logs.forEach(log => log.items.forEach(item => {
          totalKcal += item.kcal;
          totalProtein += item.protein_g;
        }));
      }
    }
    if (daysWithData === 0) return { avgKcal: 0, avgProtein: 0 };
    return { avgKcal: totalKcal / daysWithData, avgProtein: totalProtein / daysWithData };
  }, [user, getMealsByDate]);

  const weeklyVolume = useMemo(() => {
    if (!user) return 0;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    return workoutLogs
      .filter(l => l.user_id === user.id && new Date(l.started_at) >= cutoff)
      .flatMap(l => l.sets)
      .reduce((s, set) => s + set.weight_kg * set.reps, 0);
  }, [user, workoutLogs]);

  if (!user) return null;

  const latestRecord = records.at(-1) ?? null;
  const bodyType = latestRecord
    ? classifyBodyType(user.sex, latestRecord.weight_kg, latestRecord.skeletal_muscle_kg, latestRecord.body_fat_pct)
    : null;

  const chartSeries: ChartSeries[] = CHART_METRICS
    .filter(m => selectedMetrics.has(m.key))
    .map(m => ({
      color: m.color,
      values: records.map(r => {
        const v = r[m.key] as number | undefined;
        return v !== undefined && v !== null ? v : null;
      }),
    }));

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">인바디</h1>
        <Link
          href="/inbody/new"
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors"
        >
          <Plus size={16} />
          기록 추가
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="mx-4 bg-zinc-900 rounded-2xl p-10 text-center">
          <p className="text-zinc-400 text-sm mb-2">인바디 기록이 없습니다</p>
          <p className="text-zinc-600 text-xs mb-5">인바디 측정 결과를 입력해 체성분 추이와 예측을 확인하세요.</p>
          <Link href="/inbody/new" className="inline-block bg-blue-600 text-white text-sm font-semibold px-6 py-3 rounded-xl">
            첫 기록 추가
          </Link>
        </div>
      ) : (
        <>
          {/* Trend chart with metric toggles */}
          {records.length >= 2 && (
            <div className="mx-4 mb-5 bg-zinc-900 rounded-2xl p-4">
              <h2 className="font-semibold text-sm mb-3">체성분 추이</h2>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {CHART_METRICS.map(m => {
                  const active = selectedMetrics.has(m.key);
                  const hasData = records.some(r => (r[m.key] as number | undefined) !== undefined);
                  return (
                    <button
                      key={m.key}
                      onClick={() => toggleMetric(m.key)}
                      disabled={!hasData}
                      style={active ? { borderColor: m.color, color: m.color, backgroundColor: `${m.color}22` } : {}}
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        !hasData
                          ? 'border-zinc-800 text-zinc-700 cursor-default'
                          : active
                          ? 'font-semibold'
                          : 'border-zinc-700 text-zinc-500'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: hasData ? (active ? m.color : '#52525b') : '#3f3f46' }} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <LineChart records={records} series={chartSeries} />
            </div>
          )}

          {/* Latest snapshot */}
          {latestRecord && (
            <div className="mx-4 mb-5 bg-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-sm">최근 측정</h2>
                  {bodyType && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${bodyType.color} ${bodyType.bg}`}>
                      {bodyType.label} {bodyType.desc}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">{latestRecord.measured_at}</p>
              </div>

              {/* Required fields */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: '체중',    value: `${latestRecord.weight_kg}kg`,             color: 'text-white'    },
                  { label: '골격근',  value: `${latestRecord.skeletal_muscle_kg}kg`,     color: 'text-blue-400' },
                  { label: '체지방%', value: `${latestRecord.body_fat_pct}%`,            color: 'text-rose-400' },
                  { label: '체지방량', value: `${latestRecord.body_fat_kg.toFixed(1)}kg`, color: 'text-rose-300' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-zinc-800 rounded-xl py-3">
                    <p className={`text-sm font-bold ${color}`}>{value}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Optional fields (shown if any exist) */}
              {(() => {
                const opts = [
                  { label: '체수분',    value: latestRecord.body_water_kg,        fmt: (v: number) => `${v}kg`,          color: 'text-cyan-400'   },
                  { label: '기초대사량', value: latestRecord.bmr_kcal,             fmt: (v: number) => `${v}kcal`,        color: 'text-green-400'  },
                  { label: '단백질',    value: latestRecord.protein_kg,           fmt: (v: number) => `${v}kg`,          color: 'text-indigo-400' },
                  { label: '무기질',    value: latestRecord.mineral_kg,           fmt: (v: number) => `${v}kg`,          color: 'text-amber-400'  },
                  { label: '복부지방률', value: latestRecord.abdominal_fat_ratio,  fmt: (v: number) => `${v}`,            color: 'text-yellow-400' },
                  { label: '내장지방',  value: latestRecord.visceral_fat_level,   fmt: (v: number) => `Lv.${v}`,         color: 'text-purple-400' },
                ].filter(o => o.value !== undefined);
                if (opts.length === 0) return null;
                return (
                  <div className="grid grid-cols-3 gap-2 text-center mt-2">
                    {opts.map(({ label, value, fmt, color }) => (
                      <div key={label} className="bg-zinc-800/60 rounded-xl py-2">
                        <p className={`text-xs font-bold ${color}`}>{fmt(value as number)}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Prediction card */}
          {latestRecord && (
            <div className="mx-4 mb-5">
              <PredictionCard
                record={latestRecord}
                avgKcal={avgKcal}
                avgProtein={avgProtein}
                weeklyVolume={weeklyVolume}
                user={user}
              />
            </div>
          )}

          {/* Record list */}
          <div className="px-4">
            <h2 className="font-semibold text-sm text-zinc-300 uppercase tracking-wider mb-3">전체 기록</h2>
            <div className="space-y-2">
              {[...records].reverse().map((rec, idx) => {
                const prev = records[records.indexOf(rec) - 1];
                const bt = classifyBodyType(user.sex, rec.weight_kg, rec.skeletal_muscle_kg, rec.body_fat_pct);
                return (
                  <div key={rec.id} className="bg-zinc-900 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{rec.measured_at}</p>
                        {idx === 0 && (
                          <span className="text-[10px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded-full">최신</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${bt.color} ${bt.bg}`}>
                          {bt.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span>{rec.weight_kg}kg</span>
                        <span className="text-blue-400">근육 {rec.skeletal_muscle_kg}kg</span>
                        <span className="text-rose-400">지방 {rec.body_fat_pct}%</span>
                        {prev && (
                          <DeltaBadge value={rec.weight_kg - prev.weight_kg} invert={false} />
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteInbodyRecord(rec.id)}
                      className="text-zinc-600 hover:text-red-400 p-1.5 flex-shrink-0 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
