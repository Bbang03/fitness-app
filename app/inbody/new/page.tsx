'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { ChevronLeft } from 'lucide-react';

const OPTIONAL_FIELDS = [
  { key: 'abdominal_fat_ratio', label: '복부지방률 (WHR)', placeholder: '예: 0.85', step: '0.01' },
  { key: 'visceral_fat_level',  label: '내장지방레벨',      placeholder: '예: 8',    step: '1'    },
  { key: 'body_water_kg',       label: '체수분 (kg)',        placeholder: '예: 38.5', step: '0.1'  },
  { key: 'bmr_kcal',            label: '기초대사량 (kcal)', placeholder: '예: 1680', step: '1'    },
  { key: 'protein_kg',          label: '단백질 (kg)',        placeholder: '예: 10.8', step: '0.1'  },
  { key: 'mineral_kg',          label: '무기질 (kg)',        placeholder: '예: 3.5',  step: '0.1'  },
] as const;

type FormKey = 'measured_at' | 'weight_kg' | 'skeletal_muscle_kg' | 'body_fat_pct'
  | 'abdominal_fat_ratio' | 'visceral_fat_level' | 'body_water_kg'
  | 'bmr_kcal' | 'protein_kg' | 'mineral_kg';

export default function NewInbodyPage() {
  const router = useRouter();
  const { currentUser, addInbodyRecord } = useStore();
  const user = currentUser();

  useEffect(() => { if (!user) router.replace('/login'); }, [user, router]);

  const todayKey = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState<Record<FormKey, string>>({
    measured_at: todayKey,
    weight_kg: '',
    skeletal_muscle_kg: '',
    body_fat_pct: '',
    abdominal_fat_ratio: '',
    visceral_fat_level: '',
    body_water_kg: '',
    bmr_kcal: '',
    protein_kg: '',
    mineral_kg: '',
  });
  const [error, setError] = useState('');

  const bodyFatKg = form.weight_kg && form.body_fat_pct
    ? (Number(form.weight_kg) * Number(form.body_fat_pct)) / 100
    : null;

  const handleSave = () => {
    const weight  = Number(form.weight_kg);
    const skeletal = Number(form.skeletal_muscle_kg);
    const fatPct  = Number(form.body_fat_pct);

    if (!weight || !skeletal || !fatPct) {
      setError('체중, 골격근량, 체지방률은 필수 항목입니다.');
      return;
    }
    if (weight < 30 || weight > 250)  { setError('체중이 올바르지 않습니다.'); return; }
    if (skeletal > weight * 0.7)       { setError('골격근량이 체중보다 너무 큽니다.'); return; }
    if (fatPct < 1 || fatPct > 60)     { setError('체지방률이 올바르지 않습니다.'); return; }

    addInbodyRecord({
      measured_at:          form.measured_at,
      weight_kg:            weight,
      skeletal_muscle_kg:   skeletal,
      body_fat_kg:          Math.round(weight * fatPct) / 100,
      body_fat_pct:         fatPct,
      abdominal_fat_ratio:  form.abdominal_fat_ratio  ? Number(form.abdominal_fat_ratio)  : undefined,
      visceral_fat_level:   form.visceral_fat_level   ? Number(form.visceral_fat_level)   : undefined,
      body_water_kg:        form.body_water_kg        ? Number(form.body_water_kg)        : undefined,
      bmr_kcal:             form.bmr_kcal             ? Number(form.bmr_kcal)             : undefined,
      protein_kg:           form.protein_kg           ? Number(form.protein_kg)           : undefined,
      mineral_kg:           form.mineral_kg           ? Number(form.mineral_kg)           : undefined,
    });
    router.back();
  };

  const u = (f: FormKey) => (v: string) => setForm(p => ({ ...p, [f]: v }));
  const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors text-center';

  if (!user) return null;

  return (
    <div className="min-h-screen px-4 pt-10 pb-12">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white p-1 -ml-1">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">인바디 기록 추가</h1>
      </div>

      <div className="space-y-5">
        {/* Date */}
        <div>
          <label className="text-sm text-zinc-400 mb-2 block">측정일</label>
          <input
            type="date"
            value={form.measured_at}
            max={todayKey}
            onChange={e => u('measured_at')(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Required fields */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">필수 항목</p>

          <div>
            <label className="text-sm text-zinc-400 mb-2 block">체중 (kg)</label>
            <input type="number" inputMode="decimal" step="0.1"
              value={form.weight_kg} onChange={e => u('weight_kg')(e.target.value)}
              className={inputCls} placeholder="예: 72.5" />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-2 block">골격근량 (kg)</label>
            <input type="number" inputMode="decimal" step="0.1"
              value={form.skeletal_muscle_kg} onChange={e => u('skeletal_muscle_kg')(e.target.value)}
              className={inputCls} placeholder="예: 34.2" />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-2 block">체지방률 (%)</label>
            <input type="number" inputMode="decimal" step="0.1"
              value={form.body_fat_pct} onChange={e => u('body_fat_pct')(e.target.value)}
              className={inputCls} placeholder="예: 18.4" />
            {bodyFatKg !== null && (
              <p className="text-xs text-zinc-500 mt-1.5 text-center">
                체지방량 ≈ {bodyFatKg.toFixed(1)} kg
              </p>
            )}
          </div>
        </div>

        {/* Optional fields */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">선택 항목</p>
          {OPTIONAL_FIELDS.map(({ key, label, placeholder, step }) => (
            <div key={key}>
              <label className="text-sm text-zinc-400 mb-2 block">{label}</label>
              <input
                type="number"
                inputMode="decimal"
                step={step}
                value={form[key]}
                onChange={e => u(key as FormKey)(e.target.value)}
                className={inputCls}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        {/* Summary preview */}
        {form.weight_kg && form.skeletal_muscle_kg && form.body_fat_pct && (
          <div className="bg-zinc-900 rounded-2xl p-4 grid grid-cols-3 gap-4 text-center">
            {[
              { label: '체중',   value: `${form.weight_kg} kg`,        color: 'text-white'    },
              { label: '골격근', value: `${form.skeletal_muscle_kg} kg`, color: 'text-blue-400' },
              { label: '체지방', value: `${form.body_fat_pct}%`,        color: 'text-rose-400' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className={`text-base font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={handleSave}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-2xl text-base transition-colors mt-4"
        >
          저장
        </button>
      </div>
    </div>
  );
}
