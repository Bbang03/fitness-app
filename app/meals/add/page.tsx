'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  Database,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import PhotoMealScanner from '@/components/PhotoMealScanner';
import {
  calcNutrition,
  searchFoods,
  type FoodItem,
} from '@/lib/foodData';
import type {
  MealItem,
  MealLog,
  MealType,
} from '@/lib/types';

interface OpenFoodFactsFood {
  id: string;
  name: string;
  brand: string;
  dataType: string;
  servingG: number;
  per100g: {
    kcal: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
  };
}

interface MfdsFood {
  id: string;
  name: string;
  rawName: string;
  brand: string;
  foodGroup: string;
  foodOrigin: string;
  servingG: number | null;
  servingDescription: string;
  per100g: {
    kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    saturated_fat_g: number | null;
  };
  total: {
    kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    saturated_fat_g: number | null;
  } | null;
  macroComplete: boolean;
  source: 'MFDS' | 'CACHE';
  researchDate: string | null;
  updatedDate: string | null;
  supplement?: {
    sourceName: string;
    sourceUrl: string | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    status:
      | 'verified_supplement'
      | 'manual_verified'
      | 'ai_estimated';
    confidence: number | null;
    energyGapRatio: number | null;
  } | null;
}

interface BrandFoodOverride {
  external_id: string | null;
  brand_name: string;
  menu_name: string;
  serving_desc: string;
  serving_g: number | null;
  kcal: number;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  sugar_g?: number | null;
  saturated_fat_g?: number | null;
  sodium_mg?: number | null;
  source_name: string;
  source_url: string | null;
  source_checked_at: string | null;
  source_updated_at?: string | null;
  macro_status:
    | 'incomplete'
    | 'verified_supplement'
    | 'manual_verified'
    | 'ai_estimated';
  macro_confidence: number | null;
  macro_provenance?: Record<string, unknown> | null;
}

interface FatSecretSearchFood {
  id: string;
  name: string;
  brand: string;
  foodType: string;
  description: string;
  isBrand: boolean;
}

interface FatSecretServing {
  id: string;
  description: string;
  numberOfUnits: number;
  metricAmount: number;
  metricUnit: string;
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  isDefault: boolean;
}

interface FatSecretFoodDetail {
  id: string;
  name: string;
  brand: string;
  foodType: string;
  isBrand: boolean;
  servings: FatSecretServing[];
}

interface AiMacroEstimate {
  method: string;
  confidenceScore: number;
  validation: {
    carbMaePer100g: number;
    fatMaePer100g: number;
    evaluated: number;
    strategy: string;
  };
  per100g: {
    carbs_g: number;
    fat_g: number;
  };
  total: {
    carbs_g: number;
    fat_g: number;
  } | null;
  neighbors: Array<{
    brand: string;
    name: string;
    distance: number;
    carbs: number;
    fat: number;
  }>;
}

type AddItem = {
  food_name: string;
  serving: string;
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  nutrition_status?: string;
  nutrition_confidence?: number | null;
  nutrition_source?: string | null;
  nutrition_meta?: Record<string, unknown>;
};

const MEAL_TYPES: MealType[] = [
  '아침',
  '점심',
  '저녁',
  '간식',
];

function localTodayKey() {
  return new Date().toLocaleDateString('en-CA');
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function clampQuantity(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.max(0.1, Math.min(parsed, 20));
}

function scaleNutrition(
  nutrition: {
    kcal: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
  },
  multiplier: number,
) {
  return {
    kcal: Math.round(nutrition.kcal * multiplier),
    carbs_g: roundOne(nutrition.carbs_g * multiplier),
    protein_g: roundOne(nutrition.protein_g * multiplier),
    fat_g: roundOne(nutrition.fat_g * multiplier),
  };
}

async function readJson(response: Response) {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTrustedMacroStatus(
  status: BrandFoodOverride['macro_status'],
) {
  return (
    status === 'verified_supplement' ||
    status === 'manual_verified'
  );
}

function calculateEnergyGapRatio({
  kcal,
  carbs_g,
  protein_g,
  fat_g,
}: {
  kcal: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
}) {
  if (
    kcal === null ||
    kcal <= 0 ||
    carbs_g === null ||
    protein_g === null ||
    fat_g === null
  ) {
    return null;
  }

  const macroKcal =
    carbs_g * 4 +
    protein_g * 4 +
    fat_g * 9;

  return Math.abs(
    macroKcal - kcal,
  ) / kcal;
}

function energyConfidence(
  gapRatio: number,
) {
  if (gapRatio <= 0.03) return 0.99;
  if (gapRatio <= 0.06) return 0.95;
  if (gapRatio <= 0.10) return 0.90;
  if (gapRatio <= 0.12) return 0.80;
  return 0;
}

function validateSupplement(
  food: MfdsFood,
  override: BrandFoodOverride,
) {
  if (
    !food.total ||
    override.external_id !== food.id ||
    !isTrustedMacroStatus(
      override.macro_status,
    )
  ) {
    return {
      passed: false,
      confidence: 0,
      energyGapRatio: null as number | null,
    };
  }

  const brandMatch =
    normalizeSearchText(
      food.brand,
    ) ===
    normalizeSearchText(
      override.brand_name,
    );

  const menuMatch =
    normalizeSearchText(
      food.name,
    ) ===
    normalizeSearchText(
      override.menu_name,
    );

  const overrideServing =
    nullableNumber(
      override.serving_g,
    );

  const servingMatch =
    food.servingG !== null &&
    overrideServing !== null &&
    Math.abs(
      food.servingG -
      overrideServing,
    ) <=
      Math.max(
        5,
        food.servingG * 0.05,
      );

  const overrideCarbs =
    nullableNumber(
      override.carbs_g,
    );

  const overrideProtein =
    nullableNumber(
      override.protein_g,
    );

  const overrideFat =
    nullableNumber(
      override.fat_g,
    );

  const merged = {
    kcal:
      food.total.kcal,

    carbs_g:
      food.total.carbs_g ??
      overrideCarbs,

    protein_g:
      food.total.protein_g ??
      overrideProtein,

    fat_g:
      food.total.fat_g ??
      overrideFat,
  };

  const gapRatio =
    calculateEnergyGapRatio(
      merged,
    );

  const energyPassed =
    gapRatio !== null &&
    gapRatio <= 0.12;

  const storedConfidence =
    nullableNumber(
      override.macro_confidence,
    );

  const computedConfidence =
    gapRatio === null
      ? 0
      : energyConfidence(
          gapRatio,
        );

  const confidence =
    storedConfidence === null
      ? computedConfidence
      : Math.min(
          storedConfidence,
          computedConfidence,
        );

  return {
    passed:
      brandMatch &&
      menuMatch &&
      servingMatch &&
      energyPassed &&
      confidence >= 0.8,

    confidence,
    energyGapRatio:
      gapRatio,
  };
}

function mergeMfdsSupplements(
  foods: MfdsFood[],
  overrides: BrandFoodOverride[],
): MfdsFood[] {
  const overrideByExternalId =
    new Map<
      string,
      BrandFoodOverride
    >();

  for (
    const override
    of overrides
  ) {
    if (
      !override.external_id ||
      overrideByExternalId.has(
        override.external_id,
      )
    ) {
      continue;
    }

    overrideByExternalId.set(
      override.external_id,
      override,
    );
  }

  return foods.map(
    (food) => {
      const override =
        overrideByExternalId.get(
          food.id,
        );

      if (
        !override ||
        !food.total
      ) {
        return {
          ...food,
          supplement:
            null,
        };
      }

      const validation =
        validateSupplement(
          food,
          override,
        );

      if (
        !validation.passed
      ) {
        return {
          ...food,
          supplement:
            null,
        };
      }

      const overrideCarbs =
        nullableNumber(
          override.carbs_g,
        );

      const overrideProtein =
        nullableNumber(
          override.protein_g,
        );

      const overrideFat =
        nullableNumber(
          override.fat_g,
        );

      const filledCarbs =
        food.total.carbs_g ===
          null &&
        overrideCarbs !==
          null;

      const filledProtein =
        food.total.protein_g ===
          null &&
        overrideProtein !==
          null;

      const filledFat =
        food.total.fat_g ===
          null &&
        overrideFat !==
          null;

      const total = {
        ...food.total,

        carbs_g:
          food.total.carbs_g ??
          overrideCarbs,

        protein_g:
          food.total.protein_g ??
          overrideProtein,

        fat_g:
          food.total.fat_g ??
          overrideFat,
      };

      const usedSupplement =
        filledCarbs ||
        filledProtein ||
        filledFat;

      return {
        ...food,

        total,

        macroComplete:
          total.carbs_g !==
            null &&
          total.protein_g !==
            null &&
          total.fat_g !==
            null,

        supplement:
          usedSupplement
            ? {
                sourceName:
                  override.source_name,

                sourceUrl:
                  override.source_url,

                carbs_g:
                  filledCarbs
                    ? overrideCarbs
                    : null,

                protein_g:
                  filledProtein
                    ? overrideProtein
                    : null,

                fat_g:
                  filledFat
                    ? overrideFat
                    : null,

                status:
                  override.macro_status ===
                    'manual_verified'
                    ? 'manual_verified'
                    : 'verified_supplement',

                confidence:
                  validation.confidence,

                energyGapRatio:
                  validation.energyGapRatio,
              }
            : null,
      };
    },
  );
}

function toPer100g(
  value: number | null,
  servingG: number | null,
) {
  if (
    value === null ||
    servingG === null ||
    servingG <= 0
  ) {
    return null;
  }

  return roundOne(
    (value * 100) /
      servingG,
  );
}

function brandFoodToCachedMfds(
  row: BrandFoodOverride,
): MfdsFood {
  const servingG =
    nullableNumber(
      row.serving_g,
    );

  const total = {
    kcal:
      nullableNumber(
        row.kcal,
      ),

    carbs_g:
      nullableNumber(
        row.carbs_g,
      ),

    protein_g:
      nullableNumber(
        row.protein_g,
      ),

    fat_g:
      nullableNumber(
        row.fat_g,
      ),

    sugar_g:
      nullableNumber(
        row.sugar_g,
      ),

    sodium_mg:
      nullableNumber(
        row.sodium_mg,
      ),

    saturated_fat_g:
      nullableNumber(
        row.saturated_fat_g,
      ),
  };

  return {
    id:
      row.external_id ??
      `cache-${row.brand_name}-${row.menu_name}`,

    name:
      row.menu_name,

    rawName:
      row.menu_name,

    brand:
      row.brand_name,

    foodGroup:
      '브랜드 캐시',

    foodOrigin:
      'MFDS 기반 검증 캐시 + 보완 영양정보',

    servingG,

    servingDescription:
      row.serving_desc ||
      (
        servingG !== null
          ? `1개 (${servingG}g)`
          : '1회'
      ),

    per100g: {
      kcal:
        toPer100g(
          total.kcal,
          servingG,
        ),

      carbs_g:
        toPer100g(
          total.carbs_g,
          servingG,
        ),

      protein_g:
        toPer100g(
          total.protein_g,
          servingG,
        ),

      fat_g:
        toPer100g(
          total.fat_g,
          servingG,
        ),

      sugar_g:
        toPer100g(
          total.sugar_g,
          servingG,
        ),

      sodium_mg:
        toPer100g(
          total.sodium_mg,
          servingG,
        ),

      saturated_fat_g:
        toPer100g(
          total.saturated_fat_g,
          servingG,
        ),
    },

    total,

    macroComplete:
      isTrustedMacroStatus(
        row.macro_status,
      ) &&
      (nullableNumber(
        row.macro_confidence,
      ) ?? 0) >= 0.8 &&
      total.kcal !== null &&
      total.carbs_g !== null &&
      total.protein_g !== null &&
      total.fat_g !== null,

    source:
      'CACHE',

    researchDate:
      null,

    updatedDate:
      row.source_updated_at ??
      row.source_checked_at,

    supplement:
      isTrustedMacroStatus(
        row.macro_status,
      )
        ? {
            sourceName:
              row.source_name,

            sourceUrl:
              row.source_url,

            carbs_g:
              total.carbs_g,

            protein_g:
              null,

            fat_g:
              total.fat_g,

            status:
              row.macro_status,

            confidence:
              nullableNumber(
                row.macro_confidence,
              ),

            energyGapRatio:
              calculateEnergyGapRatio({
                kcal:
                  total.kcal,

                carbs_g:
                  total.carbs_g,

                protein_g:
                  total.protein_g,

                fat_g:
                  total.fat_g,
              }),
          }
        : null,
  };
}

function normalizeSearchText(
  value: string,
) {
  return value
    .replace(
      /\s+/g,
      '',
    )
    .toLocaleLowerCase(
      'ko-KR',
    );
}

function NutritionGrid({
  kcal,
  carbs_g,
  protein_g,
  fat_g,
}: {
  kcal: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
}) {
  const values = [
    {
      label: 'kcal',
      value: kcal === null ? '—' : Math.round(kcal),
      className: 'text-white',
    },
    {
      label: '탄수',
      value: carbs_g === null ? '—' : `${roundOne(carbs_g)}g`,
      className: 'text-amber-400',
    },
    {
      label: '단백',
      value: protein_g === null ? '—' : `${roundOne(protein_g)}g`,
      className: 'text-blue-400',
    },
    {
      label: '지방',
      value: fat_g === null ? '—' : `${roundOne(fat_g)}g`,
      className: 'text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {values.map(({ label, value, className }) => (
        <div key={label} className="rounded-xl bg-zinc-950/60 py-3 text-center">
          <p className={`text-sm font-bold ${className}`}>{value}</p>
          <p className="mt-1 text-[9px] text-zinc-600">{label}</p>
        </div>
      ))}
    </div>
  );
}

function ManualNumber({
  label,
  unit,
  value,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-zinc-500">
        {label} <span className="text-zinc-700">({unit})</span>
      </label>
      <input
        type="number"
        value={value}
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-white transition-colors focus:border-blue-500 focus:outline-none disabled:opacity-50"
        placeholder="0"
      />
    </div>
  );
}

function ManualForm({
  onAdd,
  disabled,
}: {
  onAdd: (item: AddItem) => void;
  disabled: boolean;
}) {
  const [form, setForm] = useState({
    name: '',
    serving: '',
    kcal: '',
    carbs: '',
    protein: '',
    fat: '',
  });
  const [error, setError] = useState('');

  const update =
    (field: keyof typeof form) =>
    (value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
      setError('');
    };

  const handleAdd = () => {
    if (!form.name.trim() || !form.kcal) {
      setError('음식 이름과 칼로리를 입력해주세요.');
      return;
    }

    onAdd({
      food_name: form.name.trim(),
      serving: form.serving.trim() || '직접 입력',
      kcal: Number(form.kcal) || 0,
      carbs_g: Number(form.carbs) || 0,
      protein_g: Number(form.protein) || 0,
      fat_g: Number(form.fat) || 0,
    });
  };

  const inputClass =
    'w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-white placeholder-zinc-700 transition-colors focus:border-blue-500 focus:outline-none disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-500">음식 이름 *</label>
        <input
          type="text"
          value={form.name}
          disabled={disabled}
          onChange={(event) => update('name')(event.target.value)}
          className={inputClass}
          placeholder="예: 닭가슴살 샐러드"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-500">섭취량</label>
        <input
          type="text"
          value={form.serving}
          disabled={disabled}
          onChange={(event) => update('serving')(event.target.value)}
          className={inputClass}
          placeholder="예: 1인분, 200g"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ManualNumber label="칼로리" unit="kcal" value={form.kcal} disabled={disabled} onChange={update('kcal')} />
        <ManualNumber label="탄수화물" unit="g" value={form.carbs} disabled={disabled} onChange={update('carbs')} />
        <ManualNumber label="단백질" unit="g" value={form.protein} disabled={disabled} onChange={update('protein')} />
        <ManualNumber label="지방" unit="g" value={form.fat} disabled={disabled} onChange={update('fat')} />
      </div>

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled}
        className="w-full rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600"
      >
        {disabled ? '저장 중...' : '식사에 추가'}
      </button>
    </div>
  );
}

function FoodRow({
  food,
  onAdd,
  disabled,
}: {
  food: FoodItem;
  onAdd: (item: AddItem) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [grams, setGrams] = useState(String(food.serving_g));

  const amount = Math.max(1, Number(grams) || food.serving_g);
  const nutrition = calcNutrition(food, amount);
  const defaultNutrition = calcNutrition(food, food.serving_g);

  return (
    <article className="border-b border-zinc-800/50 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-zinc-800/30"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{food.name}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {food.serving_desc} · {Math.round(defaultNutrition.kcal)} kcal
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-zinc-400">{Math.round(defaultNutrition.kcal)} kcal</p>
          <p className="mt-1 text-[10px] text-zinc-600">단 {roundOne(defaultNutrition.protein_g)}g</p>
        </div>
        <Plus
          size={16}
          className={`flex-shrink-0 text-blue-400 transition-transform ${expanded ? 'rotate-45' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/40 bg-zinc-950/30 px-4 py-4">
          <div className="mb-4 flex items-center gap-3">
            <label className="text-xs text-zinc-500">섭취량</label>
            <div className="relative flex-1">
              <input
                type="number"
                value={grams}
                disabled={disabled}
                inputMode="decimal"
                onChange={(event) => setGrams(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 pr-8 text-center text-sm font-semibold focus:border-blue-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-600">g</span>
            </div>
          </div>
          <NutritionGrid {...nutrition} />
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onAdd({
                food_name: food.name,
                serving: `${amount}g`,
                ...nutrition,
              })
            }
            className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            {disabled ? '저장 중...' : '이 음식 추가'}
          </button>
        </div>
      )}
    </article>
  );
}

function MfdsFoodRow({
  food,
  onAdd,
  disabled,
}: {
  food: MfdsFood;
  onAdd: (item: AddItem) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [manual, setManual] = useState({
    kcal: '',
    carbs: '',
    protein: '',
    fat: '',
  });
  const [aiEstimate, setAiEstimate] =
    useState<AiMacroEstimate | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const multiplier = clampQuantity(quantity);
  const base = food.total;

  const manualNumber = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const baseNutrition = {
    kcal:
      base?.kcal ??
      manualNumber(manual.kcal),
    carbs_g:
      base?.carbs_g ??
      manualNumber(manual.carbs) ??
      aiEstimate?.total?.carbs_g ??
      null,
    protein_g:
      base?.protein_g ??
      manualNumber(manual.protein),
    fat_g:
      base?.fat_g ??
      manualNumber(manual.fat) ??
      aiEstimate?.total?.fat_g ??
      null,
  };

  const nutrition = {
    kcal:
      baseNutrition.kcal === null
        ? null
        : Math.round(baseNutrition.kcal * multiplier),
    carbs_g:
      baseNutrition.carbs_g === null
        ? null
        : roundOne(baseNutrition.carbs_g * multiplier),
    protein_g:
      baseNutrition.protein_g === null
        ? null
        : roundOne(baseNutrition.protein_g * multiplier),
    fat_g:
      baseNutrition.fat_g === null
        ? null
        : roundOne(baseNutrition.fat_g * multiplier),
  };

  const missing = [
    { key: 'kcal', label: '칼로리', unit: 'kcal', missing: base?.kcal === null || base?.kcal === undefined },
    { key: 'carbs', label: '탄수화물', unit: 'g', missing: base?.carbs_g === null || base?.carbs_g === undefined },
    { key: 'protein', label: '단백질', unit: 'g', missing: base?.protein_g === null || base?.protein_g === undefined },
    { key: 'fat', label: '지방', unit: 'g', missing: base?.fat_g === null || base?.fat_g === undefined },
  ].filter((item) => item.missing) as Array<{
    key: keyof typeof manual;
    label: string;
    unit: string;
    missing: boolean;
  }>;

  const canEstimateWithAi =
    /^(버거|햄버거)_/.test(food.rawName) &&
    base?.kcal !== null &&
    base?.kcal !== undefined &&
    base?.protein_g !== null &&
    base?.protein_g !== undefined &&
    (
      base?.carbs_g === null ||
      base?.carbs_g === undefined ||
      base?.fat_g === null ||
      base?.fat_g === undefined
    );

  const runAiEstimate = async () => {
    if (!canEstimateWithAi || aiLoading) return;

    setAiError('');
    setAiLoading(true);

    try {
      const response = await fetch(
        '/api/macro-estimate',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            id: food.id,
            rawName: food.rawName,
            name: food.name,
            brand: food.brand,
            servingG: food.servingG,
            kcalPer100g:
              food.per100g.kcal,
            proteinPer100g:
              food.per100g.protein_g,
            carbsPer100g:
              food.per100g.carbs_g,
            fatPer100g:
              food.per100g.fat_g,
            sugarPer100g:
              food.per100g.sugar_g,
            sodiumPer100g:
              food.per100g.sodium_mg,
            saturatedFatPer100g:
              food.per100g
                .saturated_fat_g,
          }),
        },
      );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.message ??
            'AI 추정에 실패했습니다.',
        );
      }

      setAiEstimate(
        payload as AiMacroEstimate,
      );
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : 'AI 추정에 실패했습니다.',
      );
    } finally {
      setAiLoading(false);
    }
  };

  const canAdd =
    nutrition.kcal !== null &&
    nutrition.carbs_g !== null &&
    nutrition.protein_g !== null &&
    nutrition.fat_g !== null;

  const kcalText = base?.kcal === null || base?.kcal === undefined
    ? '영양정보 일부 제공'
    : `${Math.round(base.kcal)} kcal`;

  const extraNutrition = [
    base?.sugar_g !== null && base?.sugar_g !== undefined
      ? `당류 ${roundOne(base.sugar_g)}g`
      : null,
    base?.sodium_mg !== null && base?.sodium_mg !== undefined
      ? `나트륨 ${roundOne(base.sodium_mg)}mg`
      : null,
    base?.saturated_fat_g !== null && base?.saturated_fat_g !== undefined
      ? `포화지방 ${roundOne(base.saturated_fat_g)}g`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="border-b border-zinc-800/50 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-zinc-800/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{food.name}</p>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                food.source === 'CACHE'
                  ? 'bg-blue-500/10 text-blue-300'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {aiEstimate
                ? 'AI 추정'
                : food.source === 'CACHE'
                  ? food.supplement?.status === 'verified_supplement'
                    ? '검증 보완'
                    : food.supplement?.status === 'manual_verified'
                      ? '검증 완료'
                      : '빠른 캐시'
                  : food.supplement
                    ? '식약처 + 검증 보완'
                    : '식약처'}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {food.brand} · {food.servingDescription}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs font-semibold text-zinc-300">{kcalText}</p>
          <p className="mt-1 text-[10px] text-zinc-600">
            {base?.protein_g === null || base?.protein_g === undefined
              ? '단백질 정보 없음'
              : `단 ${roundOne(base.protein_g)}g`}
          </p>
        </div>

        <Plus
          size={16}
          className={`flex-shrink-0 text-emerald-400 transition-transform ${
            expanded ? 'rotate-45' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/40 bg-zinc-950/30 px-4 py-4">
          <div className="mb-4 flex items-center gap-3">
            <label className="text-xs text-zinc-500">수량</label>
            <input
              type="number"
              min="0.1"
              max="20"
              step="0.5"
              value={quantity}
              disabled={disabled}
              onChange={(event) => setQuantity(event.target.value)}
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-center text-sm font-semibold focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <NutritionGrid {...nutrition} />

          {missing.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] p-3.5">
              <p className="text-xs font-semibold text-amber-300">
                식약처 원본에 일부 탄단지 정보가 없어요
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                없는 값을 0g으로 저장하지 않습니다. 버거류는 FitTrack AI로 추정하거나 직접 입력할 수 있어요.
              </p>

              {canEstimateWithAi && (
                <button
                  type="button"
                  disabled={disabled || aiLoading}
                  onClick={() => void runAiEstimate()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.08] py-2.5 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/[0.12] disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  {aiLoading
                    ? '유사 버거 분석 중...'
                    : aiEstimate
                      ? 'AI 탄·지 다시 추정'
                      : 'AI로 탄·지 추정'}
                </button>
              )}

              {aiError && (
                <p className="mt-2 text-[10px] text-red-400">
                  {aiError}
                </p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {missing.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-[10px] text-zinc-500">
                      {field.label} ({field.unit})
                    </label>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={manual[field.key]}
                      disabled={disabled}
                      onChange={(event) =>
                        setManual((previous) => ({
                          ...previous,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiEstimate && (
            <div className="mt-4 rounded-2xl border border-violet-500/15 bg-violet-500/[0.06] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-violet-300">
                  FitTrack AI 탄단지 추정
                </p>
                <span className="rounded-md bg-violet-500/10 px-2 py-1 text-[9px] font-semibold text-violet-300">
                  AI 추정
                </span>
              </div>

              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                식약처의 완전한 버거 영양정보를 기반으로 유사 버거 9개를 찾고,
                열량 제약식으로 탄수화물과 지방을 추정합니다. 공식 영양값이 아닙니다.
              </p>

              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-400">
                {base?.carbs_g === null || base?.carbs_g === undefined ? (
                  <span>탄수 {roundOne(aiEstimate.total?.carbs_g ?? aiEstimate.per100g.carbs_g)}g</span>
                ) : null}
                {base?.fat_g === null || base?.fat_g === undefined ? (
                  <span>지방 {roundOne(aiEstimate.total?.fat_g ?? aiEstimate.per100g.fat_g)}g</span>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-zinc-600">
                <span>
                  AI 신뢰 점수 {Math.round(aiEstimate.confidenceScore * 100)}%
                </span>
                <span>
                  교차 브랜드 MAE 탄수 {aiEstimate.validation.carbMaePer100g}g / 지방 {aiEstimate.validation.fatMaePer100g}g (100g 기준)
                </span>
              </div>

              {aiEstimate.neighbors.length > 0 && (
                <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">
                  유사 메뉴: {aiEstimate.neighbors
                    .slice(0, 3)
                    .map((neighbor) => `${neighbor.brand} ${neighbor.name}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}

          {food.supplement && (
            <div className="mt-4 rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-blue-300">
                  검증된 영양정보 보완
                </p>
                <span className="rounded-md bg-blue-500/10 px-2 py-1 text-[9px] font-semibold text-blue-300">
                  {food.supplement.status === 'manual_verified'
                    ? '수동 검증'
                    : '자동 검증'}
                </span>
              </div>

              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                브랜드·메뉴·중량 일치와 열량 검산을 통과한 값만, 식약처에서 비어 있던 항목에 보완했어요.
              </p>

              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-400">
                {food.supplement.carbs_g !== null && (
                  <span>탄수 {roundOne(food.supplement.carbs_g)}g</span>
                )}
                {food.supplement.protein_g !== null && (
                  <span>단백 {roundOne(food.supplement.protein_g)}g</span>
                )}
                {food.supplement.fat_g !== null && (
                  <span>지방 {roundOne(food.supplement.fat_g)}g</span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-zinc-600">
                <span>
                  보완 출처: {food.supplement.sourceName}
                </span>

                {food.supplement.confidence !== null && (
                  <span>
                    신뢰도 {Math.round(food.supplement.confidence * 100)}%
                  </span>
                )}

                {food.supplement.energyGapRatio !== null && (
                  <span>
                    열량 검산 오차 {roundOne(food.supplement.energyGapRatio * 100)}%
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-xl bg-zinc-900/70 px-3 py-2.5 text-[10px] leading-relaxed text-zinc-600">
            <p>
              기준 출처:{' '}
              {food.source === 'CACHE'
                ? food.supplement?.sourceName ?? 'FitTrack 검증 캐시'
                : `식품의약품안전처 · ${food.foodOrigin}`}
            </p>
            {extraNutrition && <p className="mt-1">{extraNutrition}</p>}
            {food.researchDate && <p className="mt-1">조사일: {food.researchDate}</p>}
            {food.updatedDate && <p className="mt-1">업데이트: {food.updatedDate}</p>}
          </div>

          <button
            type="button"
            disabled={disabled || !canAdd}
            onClick={() => {
              if (!canAdd) return;

              const manualUsed =
                missing.some(
                  (field) =>
                    manual[
                      field.key
                    ].trim().length >
                    0,
                );

              const nutritionStatus =
                manualUsed
                  ? 'manual'
                  : aiEstimate
                    ? 'ai_estimated'
                    : food.supplement
                      ? food.supplement.status
                      : 'official';

              onAdd({
                food_name: `${food.brand} · ${food.name}`,
                serving:
                  multiplier === 1
                    ? food.servingDescription
                    : `${multiplier} × ${food.servingDescription}`,
                kcal: nutrition.kcal!,
                carbs_g: nutrition.carbs_g!,
                protein_g: nutrition.protein_g!,
                fat_g: nutrition.fat_g!,
                nutrition_status:
                  nutritionStatus,
                nutrition_confidence:
                  manualUsed
                    ? null
                    : aiEstimate
                      ? aiEstimate.confidenceScore
                      : food.supplement?.confidence ?? 1,
                nutrition_source:
                  manualUsed
                    ? 'user_manual'
                    : aiEstimate
                      ? 'MFDS + FitTrack burger kNN energy-constrained estimator'
                      : food.supplement?.sourceName ??
                        'MFDS',
                nutrition_meta:
                  aiEstimate && !manualUsed
                    ? {
                        method:
                          aiEstimate.method,
                        validation:
                          aiEstimate.validation,
                        neighbors:
                          aiEstimate.neighbors,
                        mfds_food_id:
                          food.id,
                      }
                    : {
                        mfds_food_id:
                          food.id,
                      },
              });
            }}
            className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            {disabled
              ? '저장 중...'
              : canAdd
                ? '이 메뉴 추가'
                : '누락 영양정보 입력 후 추가'}
          </button>
        </div>
      )}
    </article>
  );
}

function OpenFoodFactsRow({
  food,
  onAdd,
  disabled,
}: {
  food: OpenFoodFactsFood;
  onAdd: (item: AddItem) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [grams, setGrams] = useState(String(food.servingG || 100));

  const defaultServing = food.servingG > 0 ? food.servingG : 100;
  const amount = Math.max(1, Number(grams) || defaultServing);
  const nutrition = scaleNutrition(food.per100g, amount / 100);
  const defaultNutrition = scaleNutrition(food.per100g, defaultServing / 100);

  const subtitle = [
    food.brand || null,
    `${defaultServing}g 기준`,
    `${defaultNutrition.kcal}kcal`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="border-b border-zinc-800/50 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-zinc-800/30"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{food.name}</p>
          <p className="mt-1 truncate text-xs text-zinc-600">{subtitle}</p>
        </div>
        <Plus size={16} className={`flex-shrink-0 text-blue-400 transition-transform ${expanded ? 'rotate-45' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/40 bg-zinc-950/30 px-4 py-4">
          <div className="mb-4 flex items-center gap-3">
            <label className="text-xs text-zinc-500">섭취량</label>
            <div className="relative flex-1">
              <input
                type="number"
                value={grams}
                disabled={disabled}
                onChange={(event) => setGrams(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 pr-8 text-center text-sm font-semibold focus:border-blue-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-600">g</span>
            </div>
          </div>
          <NutritionGrid {...nutrition} />
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onAdd({
                food_name: food.name,
                serving: `${amount}g${food.brand ? ` (${food.brand})` : ''}`,
                ...nutrition,
              })
            }
            className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            {disabled ? '저장 중...' : '이 음식 추가'}
          </button>
        </div>
      )}
    </article>
  );
}

function FatSecretFoodRow({
  food,
  onAdd,
  disabled,
}: {
  food: FatSecretSearchFood;
  onAdd: (item: AddItem) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<FatSecretFoodDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedServingId, setSelectedServingId] = useState('');
  const [quantity, setQuantity] = useState('1');

  const loadDetail = async () => {
    if (detail || detailLoading) return;

    setDetailLoading(true);
    setDetailError('');

    try {
      const response = await fetch(`/api/fatsecret/food?id=${encodeURIComponent(food.id)}`);
      const json = (await readJson(response)) as FatSecretFoodDetail;

      if (!json.servings?.length) {
        setDetailError('제공량 영양정보를 찾지 못했습니다.');
        return;
      }

      setDetail(json);
      const initial = json.servings.find((serving) => serving.isDefault) ?? json.servings[0];
      setSelectedServingId(initial.id);
    } catch (error) {
      console.error('FatSecret detail failed:', error);
      setDetailError('상세 영양정보를 불러오지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedServing = useMemo(() => {
    if (!detail) return null;
    return (
      detail.servings.find((serving) => serving.id === selectedServingId) ??
      detail.servings[0] ??
      null
    );
  }, [detail, selectedServingId]);

  const multiplier = clampQuantity(quantity);
  const nutrition = selectedServing
    ? scaleNutrition(selectedServing, multiplier)
    : null;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadDetail();
  };

  return (
    <article className="border-b border-zinc-800/50 last:border-0">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-zinc-800/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{food.name}</p>
            {food.isBrand && (
              <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400">브랜드</span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-600">
            {[food.brand || null, food.foodType].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Plus size={16} className={`flex-shrink-0 text-blue-400 transition-transform ${expanded ? 'rotate-45' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/40 bg-zinc-950/30 px-4 py-4">
          {detailLoading ? (
            <SearchLoading label="FatSecret 상세정보 불러오는 중..." />
          ) : detailError ? (
            <div className="rounded-xl bg-red-500/10 px-3 py-3 text-xs text-red-400">{detailError}</div>
          ) : detail && selectedServing && nutrition ? (
            <>
              <div className="mb-4">
                <label className="mb-1.5 block text-xs text-zinc-500">제공량</label>
                <select
                  value={selectedServing.id}
                  disabled={disabled}
                  onChange={(event) => setSelectedServingId(event.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {detail.servings.map((serving) => (
                    <option key={serving.id} value={serving.id}>
                      {serving.description}
                      {serving.metricAmount > 0
                        ? ` · ${roundOne(serving.metricAmount)}${serving.metricUnit}`
                        : ''}
                      {` · ${serving.kcal}kcal`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <label className="text-xs text-zinc-500">수량</label>
                <input
                  type="number"
                  min="0.1"
                  max="20"
                  step="0.5"
                  value={quantity}
                  disabled={disabled}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-center text-sm font-semibold focus:border-blue-500 focus:outline-none"
                />
              </div>

              <NutritionGrid {...nutrition} />

              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onAdd({
                    food_name: detail.brand
                      ? `${detail.brand} · ${detail.name}`
                      : detail.name,
                    serving:
                      multiplier === 1
                        ? selectedServing.description
                        : `${multiplier} × ${selectedServing.description}`,
                    ...nutrition,
                  })
                }
                className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                {disabled ? '저장 중...' : '이 음식 추가'}
              </button>
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}

function FoodSourceCard({
  title,
  icon: Icon,
  loading,
  children,
}: {
  title: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60">
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-zinc-600" />}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
        </div>
        {loading && (
          <div className="h-3 w-3 animate-spin rounded-full border border-zinc-700 border-t-blue-500" />
        )}
      </div>
      {children}
    </div>
  );
}

function SearchLoading({ label = '검색 중...' }: { label?: string }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto h-4 w-4 animate-spin rounded-full border border-zinc-700 border-t-blue-500" />
      <p className="mt-3 text-xs text-zinc-600">{label}</p>
    </div>
  );
}

function EmptySource({ label = '검색 결과 없음' }: { label?: string }) {
  return <div className="py-6 text-center text-xs text-zinc-700">{label}</div>;
}

function AddMealInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentUser,
    users,
    setMealLogs,
    addMealItem,
  } = useStore();

  const user = currentUser();
  const storedUser = user
    ? users.find((item) => item.id === user.id)
    : null;
  const isGuest = Boolean(storedUser?.is_guest);

  const fatSecretEnabled =
    process.env.NEXT_PUBLIC_FATSECRET_ENABLED === 'true';

  const date = searchParams.get('date') ?? localTodayKey();
  const requestedMealType = searchParams.get('type');
  const mealType: MealType = MEAL_TYPES.includes(requestedMealType as MealType)
    ? (requestedMealType as MealType)
    : '아침';

  const [tab, setTab] = useState<'search' | 'manual'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>(() => searchFoods(''));
  const [mfdsResults, setMfdsResults] = useState<MfdsFood[]>([]);
  const [offResults, setOffResults] = useState<OpenFoodFactsFood[]>([]);
  const [fsResults, setFsResults] = useState<FatSecretSearchFood[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user?.id, router]);

  useEffect(() => {
    setResults(searchFoods(query));
  }, [query]);

  useEffect(() => {
    const trimmed =
      query.trim();

    if (
      trimmed.length < 2
    ) {
      setMfdsResults([]);
      setOffResults([]);
      setFsResults([]);
      setExternalLoading(false);
      return;
    }

    const hasHangul =
      /[가-힣]/.test(
        trimmed,
      );

    let cancelled =
      false;

    setExternalLoading(
      true,
    );

    const timer =
      window.setTimeout(
        async () => {
          // ─────────────────────────────────────
          // 한글 검색:
          // 1) Supabase 검증 캐시를 먼저 확인
          // 2) 정확히 완성된 캐시가 있으면 MFDS 호출 생략
          // 3) 캐시 미스일 때만 MFDS
          // FatSecret/OFF는 호출하지 않는다.
          // ─────────────────────────────────────
          if (hasHangul) {
            setOffResults([]);
            setFsResults([]);

            let cachedRows:
              BrandFoodOverride[] =
                [];

            try {
              const supabase =
                createClient();

              const {
                data,
                error,
              } =
                await supabase.rpc(
                  'search_brand_foods',
                  {
                    p_query:
                      trimmed,

                    p_limit:
                      10,
                  },
                );

              if (
                cancelled
              ) {
                return;
              }

              if (error) {
                console.error(
                  'Brand food cache lookup failed:',
                  error.message,
                );
              } else {
                cachedRows =
                  (data ??
                    []) as
                    BrandFoodOverride[];

                if (
                  cachedRows.length >
                  0
                ) {
                  setMfdsResults(
                    cachedRows.map(
                      brandFoodToCachedMfds,
                    ),
                  );
                }
              }
            } catch (
              error
            ) {
              console.error(
                'Brand food cache lookup failed:',
                error,
              );
            }

            const normalizedQuery =
              normalizeSearchText(
                trimmed,
              );

            const exactComplete =
              cachedRows.find(
                (row) => {
                  const food =
                    brandFoodToCachedMfds(
                      row,
                    );

                  return (
                    normalizeSearchText(
                      row.menu_name,
                    ) ===
                      normalizedQuery &&
                    food.macroComplete
                  );
                },
              );

            // 데모 핵심:
            // 싸이버거처럼 완전한 캐시가 있으면
            // 느린 MFDS 네트워크 호출을 아예 하지 않는다.
            if (exactComplete) {
              if (
                !cancelled
              ) {
                setExternalLoading(
                  false,
                );
              }

              return;
            }

            try {
              const mfdsPayload =
                (await fetch(
                  `/api/mfds/search?q=${encodeURIComponent(
                    trimmed,
                  )}`,
                ).then(
                  readJson,
                )) as {
                  foods?:
                    MfdsFood[];
                };

              if (
                cancelled
              ) {
                return;
              }

              const mfdsFoods =
                mfdsPayload.foods ??
                [];

              if (
                mfdsFoods.length ===
                0
              ) {
                if (
                  cachedRows.length ===
                  0
                ) {
                  setMfdsResults(
                    [],
                  );
                }

                setExternalLoading(
                  false,
                );

                return;
              }

              const externalIds =
                Array.from(
                  new Set(
                    mfdsFoods
                      .map(
                        (
                          food,
                        ) =>
                          food.id,
                      )
                      .filter(
                        Boolean,
                      ),
                  ),
                );

              try {
                const supabase =
                  createClient();

                const {
                  data:
                    overrideRows,
                  error:
                    overrideError,
                } =
                  await supabase
                    .from(
                      'brand_foods',
                    )
                    .select(`
                      external_id,
                      brand_name,
                      menu_name,
                      serving_desc,
                      serving_g,
                      kcal,
                      carbs_g,
                      protein_g,
                      fat_g,
                      sugar_g,
                      saturated_fat_g,
                      sodium_mg,
                      source_name,
                      source_url,
                      source_checked_at,
                      source_updated_at,
                      macro_status,
                      macro_confidence,
                      macro_provenance
                    `)
                    .eq(
                      'is_active',
                      true,
                    )
                    .in(
                      'external_id',
                      externalIds,
                    )
                    .order(
                      'source_checked_at',
                      {
                        ascending:
                          false,
                      },
                    );

                if (
                  cancelled
                ) {
                  return;
                }

                if (
                  overrideError
                ) {
                  console.error(
                    'Brand food supplement lookup failed:',
                    overrideError.message,
                  );

                  setMfdsResults(
                    mfdsFoods.map(
                      (
                        food,
                      ) => ({
                        ...food,
                        supplement:
                          null,
                      }),
                    ),
                  );
                } else {
                  setMfdsResults(
                    mergeMfdsSupplements(
                      mfdsFoods,
                      (overrideRows ??
                        []) as
                        BrandFoodOverride[],
                    ),
                  );
                }
              } catch (
                error
              ) {
                console.error(
                  'Brand food supplement lookup failed:',
                  error,
                );

                setMfdsResults(
                  mfdsFoods.map(
                    (
                      food,
                    ) => ({
                      ...food,
                      supplement:
                        null,
                    }),
                  ),
                );
              }
            } catch (
              error
            ) {
              console.error(
                'MFDS search failed:',
                error,
              );

              // 이미 Supabase 캐시 결과를 보여주고 있다면 유지한다.
              if (
                cachedRows.length ===
                0
              ) {
                setMfdsResults(
                  [],
                );
              }
            }

            if (
              !cancelled
            ) {
              setExternalLoading(
                false,
              );
            }

            return;
          }

          // ─────────────────────────────────────
          // 영문/비한글 검색:
          // 글로벌 DB만 검색한다.
          // 느린 MFDS는 불필요하게 호출하지 않는다.
          // ─────────────────────────────────────
          setMfdsResults([]);

          const offRequest = fetch(
            `/api/openfoodfacts/search?q=${encodeURIComponent(
              trimmed,
            )}`,
          ).then(
            readJson,
          );
          
          const fatSecretRequest = fatSecretEnabled
            ? fetch(
                `/api/fatsecret/search?q=${encodeURIComponent(
                  trimmed,
                )}`,
              ).then(
                readJson,
              )
            : Promise.resolve({
                foods: [] as FatSecretSearchFood[],
              });

          const [
            offResponse,
            fatSecretResponse,
          ] = await Promise.allSettled([
            offRequest,
            fatSecretRequest,
          ]);

          if (
            cancelled
          ) {
            return;
          }

          if (
            offResponse.status ===
            'fulfilled'
          ) {
            const payload =
              offResponse.value as {
                foods?:
                  OpenFoodFactsFood[];
              };

            setOffResults(
              payload.foods ??
                [],
            );
          } else {
            setOffResults([]);
          }

          if (
            fatSecretResponse.status ===
            'fulfilled'
          ) {
            const payload =
              fatSecretResponse.value as {
                foods?:
                  FatSecretSearchFood[];
              };

            setFsResults(
              payload.foods ??
                [],
            );
          } else {
            setFsResults([]);
          }

          setExternalLoading(
            false,
          );
        },
        350,
      );

    return () => {
      cancelled = true;

      window.clearTimeout(
        timer,
      );
    };
  }, [query]);

  const handleAddMany = useCallback(
    async (items: AddItem[]) => {
      if (!user || isSaving || items.length === 0) return;

      setSaveError('');
      setIsSaving(true);

      try {
        if (isGuest) {
          items.forEach(item => addMealItem(date, mealType, item));
          router.back();
          return;
        }

        const supabase = createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError || !authData.user) {
          setSaveError('로그인 상태를 확인할 수 없습니다.');
          return;
        }

        const candidateLogId = crypto.randomUUID();
        const { error: logUpsertError } = await supabase
          .from('meal_logs')
          .upsert(
            {
              id: candidateLogId,
              user_id: user.id,
              date,
              meal_type: mealType,
            },
            {
              onConflict: 'user_id,date,meal_type',
              ignoreDuplicates: true,
            },
          );

        if (logUpsertError) {
          console.error('Meal log create failed:', logUpsertError.message);
          setSaveError('식사 기록을 준비하는 중 문제가 발생했습니다.');
          return;
        }

        const { data: mealLogRow, error: mealLogError } = await supabase
          .from('meal_logs')
          .select(`
            id,
            user_id,
            date,
            meal_type
          `)
          .eq('user_id', user.id)
          .eq('date', date)
          .eq('meal_type', mealType)
          .single();

        if (mealLogError || !mealLogRow) {
          console.error('Meal log lookup failed:', mealLogError?.message);
          setSaveError('식사 기록을 찾을 수 없습니다.');
          return;
        }

        const { data: insertedItems, error: itemError } = await supabase
          .from('meal_items')
          .insert(items.map(item => ({
              id: crypto.randomUUID(),
              meal_log_id: mealLogRow.id,
              food_name: item.food_name,
              serving: item.serving,
              kcal: item.kcal,
              carbs_g: item.carbs_g,
              protein_g: item.protein_g,
              fat_g: item.fat_g,
              nutrition_status: item.nutrition_status ?? 'database',
              nutrition_confidence: item.nutrition_confidence ?? null,
              nutrition_source: item.nutrition_source ?? null,
              nutrition_meta: item.nutrition_meta ?? {},
            })))
          .select(`
            id,
            meal_log_id,
            food_name,
            serving,
            kcal,
            carbs_g,
            protein_g,
            fat_g
          `);

        if (itemError || !insertedItems || insertedItems.length !== items.length) {
          console.error('Meal item insert failed:', itemError?.message);
          setSaveError('음식 저장에 실패했습니다.');
          return;
        }

        const newItems: MealItem[] = insertedItems.map(insertedItem => ({
            id: insertedItem.id,
            meal_log_id: insertedItem.meal_log_id,
            food_name: insertedItem.food_name,
            serving: insertedItem.serving ?? '',
            kcal: Number(insertedItem.kcal),
            carbs_g: Number(insertedItem.carbs_g),
            protein_g: Number(insertedItem.protein_g),
            fat_g: Number(insertedItem.fat_g),
          }));

        const currentLogs = useStore.getState().mealLogs;
        const existing = currentLogs.find((log) => log.id === mealLogRow.id);
        let nextLogs: MealLog[];

        if (existing) {
          nextLogs = currentLogs.map((log) =>
            log.id === existing.id
              ? { ...log, items: [...log.items, ...newItems] }
              : log,
          );
        } else {
          const newLog: MealLog = {
            id: mealLogRow.id,
            user_id: mealLogRow.user_id,
            date: mealLogRow.date,
            meal_type: mealLogRow.meal_type as MealType,
            items: newItems,
          };
          nextLogs = [...currentLogs, newLog];
        }

        setMealLogs(nextLogs);
        router.back();
      } catch (error) {
        console.error('Meal save failed:', error);
        setSaveError('음식을 저장하는 중 문제가 발생했습니다.');
      } finally {
        setIsSaving(false);
      }
    },
    [
      user?.id,
      isGuest,
      isSaving,
      date,
      mealType,
      addMealItem,
      router,
      setMealLogs,
    ],
  );

  const handleAdd = useCallback(
    async (item: AddItem) => handleAddMany([item]),
    [handleAddMany],
  );

  if (!user) return null;

  const hasQuery = query.trim().length >= 2;
  const isKoreanQuery = /[가-힣]/.test(query.trim());

  const noResults =
    hasQuery &&
    results.length === 0 &&
    !externalLoading &&
    mfdsResults.length === 0 &&
    offResults.length === 0 &&
    fsResults.length === 0;

  return (
    <div className="fittrack-apple min-h-screen pb-8">
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/90 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 pt-10 pb-4">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isSaving}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="apple-page-kicker">{mealType}</p>
            <h1 className="text-xl font-bold">음식 기록</h1>
          </div>
          <span className="text-xs text-zinc-600">{date}</span>
        </div>
      </header>

      <main className="px-5 pt-5">
        <section className="mb-6">
          <PhotoMealScanner onAddMany={handleAddMany} />
        </section>

        <section>
          <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setTab('search')}
              className={`rounded-lg py-2.5 text-sm font-medium transition-colors ${
                tab === 'search' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              음식 검색
            </button>
            <button
              type="button"
              onClick={() => setTab('manual')}
              className={`rounded-lg py-2.5 text-sm font-medium transition-colors ${
                tab === 'manual' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              직접 입력
            </button>
          </div>
        </section>

        {saveError && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-400">
            {saveError}
          </div>
        )}

        {tab === 'search' ? (
          <section className="mt-5">
            <div className="apple-sticky-canvas sticky top-[89px] z-20 -mx-1 px-1 pb-3 backdrop-blur-xl">
              <div className="relative">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-3.5 pl-10 pr-10 text-sm text-white placeholder-zinc-600 transition-colors focus:border-blue-500 focus:outline-none"
                  placeholder="음식 이름 또는 브랜드 검색"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <p className="mt-2 px-1 text-[10px] text-zinc-700">
                {isKoreanQuery
                  ? '한글 검색은 식약처 기준 데이터에 검증된 탄·단·지 보완값을 결합합니다.'
                  : fatSecretEnabled
                    ? '영문 검색은 FatSecret · OpenFoodFacts 글로벌 DB를 사용합니다.'
                    : '영문 검색은 OpenFoodFacts 글로벌 DB를 사용합니다.'}
              </p>
            </div>

            <div className="space-y-4 pb-8">
              {hasQuery && (
                <FoodSourceCard
                  title="국내 브랜드 · 식약처 + 검증 보완"
                  icon={Database}
                  loading={externalLoading && mfdsResults.length === 0}
                >
                  {externalLoading && mfdsResults.length === 0 ? (
                    <SearchLoading />
                  ) : mfdsResults.length > 0 ? (
                    mfdsResults.map((food) => (
                      <MfdsFoodRow
                        key={`mfds-${food.id}`}
                        food={food}
                        disabled={isSaving}
                        onAdd={(item) => void handleAdd(item)}
                      />
                    ))
                  ) : (
                    <EmptySource label="식약처 브랜드 메뉴 검색 결과 없음" />
                  )}
                </FoodSourceCard>
              )}

              {results.length > 0 && (
                <FoodSourceCard title="기본 음식 DB" icon={Database}>
                  {results.map((food) => (
                    <FoodRow
                      key={food.id}
                      food={food}
                      disabled={isSaving}
                      onAdd={(item) => void handleAdd(item)}
                    />
                  ))}
                </FoodSourceCard>
              )}

              {fatSecretEnabled && hasQuery && !isKoreanQuery && (
                <FoodSourceCard
                  title="FatSecret · 글로벌"
                  loading={externalLoading && fsResults.length === 0}
                >
                  {externalLoading && fsResults.length === 0 ? (
                    <SearchLoading />
                  ) : fsResults.length > 0 ? (
                    fsResults.map((food) => (
                      <FatSecretFoodRow
                        key={`fs-${food.id}`}
                        food={food}
                        disabled={isSaving}
                        onAdd={(item) => void handleAdd(item)}
                      />
                    ))
                  ) : (
                    <EmptySource />
                  )}
                </FoodSourceCard>
              )}

              {hasQuery && !isKoreanQuery && (
                <FoodSourceCard
                  title="OpenFoodFacts"
                  loading={externalLoading && offResults.length === 0}
                >
                  {externalLoading && offResults.length === 0 ? (
                    <SearchLoading />
                  ) : offResults.length > 0 ? (
                    offResults.map((food) => (
                      <OpenFoodFactsRow
                        key={`off-${food.id}`}
                        food={food}
                        disabled={isSaving}
                        onAdd={(item) => void handleAdd(item)}
                      />
                    ))
                  ) : (
                    <EmptySource />
                  )}
                </FoodSourceCard>
              )}

              {noResults && (
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-5 py-8 text-center">
                  <Search size={22} className="mx-auto text-zinc-700" />
                  <p className="mt-3 text-sm text-zinc-500">
                    &ldquo;{query}&rdquo; 검색 결과가 없어요.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('manual')}
                    className="mt-3 text-xs font-semibold text-blue-400"
                  >
                    직접 입력하기
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-5">
            <div className="mb-5">
              <h2 className="text-sm font-semibold">영양 정보 직접 입력</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                검색 DB에 없는 음식이나 직접 조리한 음식을 기록할 수 있어요.
              </p>
            </div>
            <ManualForm disabled={isSaving} onAdd={(item) => void handleAdd(item)} />
          </section>
        )}
      </main>

      {isSaving && (
        <div className="fixed inset-x-0 bottom-5 z-50 mx-auto w-[calc(100%-40px)] max-w-sm rounded-2xl border border-blue-500/20 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            <span className="text-xs font-medium text-zinc-300">식단을 저장하고 있어요</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddMealPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-zinc-600">로딩 중...</p>
        </div>
      }
    >
      <AddMealInner />
    </Suspense>
  );
}
