'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { ChevronLeft, Search, Plus, X } from 'lucide-react';
import { searchFoods, calcNutrition, type FoodItem } from '@/lib/foodData';
import type { MealType } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────────

interface FsFood {
  id: string;
  name: string;
  description: string;
  type: string;
}

interface FsServing {
  id: string;
  description: string;
  metric_amount: number;
  metric_unit: string;
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
}

interface FsDetail {
  id: string;
  name: string;
  servings: FsServing[];
}

type AddItem = {
  food_name: string;
  serving: string;
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
};

// ── Shared nutrition grid ──────────────────────────────────────────────────

function NutritionGrid({ kcal, carbs_g, protein_g, fat_g }: { kcal: number; carbs_g: number; protein_g: number; fat_g: number }) {
  return (
    <div className="grid grid-cols-4 gap-2 mb-3 text-center">
      {[
        { label: 'kcal', value: kcal, color: 'text-white' },
        { label: '탄수', value: `${carbs_g}g`, color: 'text-amber-400' },
        { label: '단백', value: `${protein_g}g`, color: 'text-blue-400' },
        { label: '지방', value: `${fat_g}g`, color: 'text-rose-400' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-zinc-800 rounded-lg py-2">
          <p className={`text-sm font-bold ${color}`}>{value}</p>
          <p className="text-[10px] text-zinc-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Manual entry form ──────────────────────────────────────────────────────

function ManualForm({ onAdd }: { onAdd: (item: AddItem) => void }) {
  const [form, setForm] = useState({ name: '', serving: '', kcal: '', carbs: '', protein: '', fat: '' });
  const [error, setError] = useState('');

  const handleAdd = () => {
    if (!form.name.trim() || !form.kcal) { setError('음식 이름과 칼로리를 입력해주세요.'); return; }
    onAdd({
      food_name: form.name.trim(),
      serving: form.serving || '직접 입력',
      kcal: Number(form.kcal) || 0,
      carbs_g: Number(form.carbs) || 0,
      protein_g: Number(form.protein) || 0,
      fat_g: Number(form.fat) || 0,
    });
  };

  const u = (f: string) => (v: string) => setForm(p => ({ ...p, [f]: v }));
  const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors';

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">음식 이름 *</label>
        <input type="text" value={form.name} onChange={e => u('name')(e.target.value)}
          className={inputCls} placeholder="예: 닭가슴살 샐러드" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">제공량 (선택)</label>
        <input type="text" value={form.serving} onChange={e => u('serving')(e.target.value)}
          className={inputCls} placeholder="예: 1인분, 200g" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">칼로리 (kcal) *</label>
          <input type="number" value={form.kcal} onChange={e => u('kcal')(e.target.value)}
            className={inputCls} placeholder="0" inputMode="numeric" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">탄수화물 (g)</label>
          <input type="number" value={form.carbs} onChange={e => u('carbs')(e.target.value)}
            className={inputCls} placeholder="0" inputMode="decimal" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">단백질 (g)</label>
          <input type="number" value={form.protein} onChange={e => u('protein')(e.target.value)}
            className={inputCls} placeholder="0" inputMode="decimal" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">지방 (g)</label>
          <input type="number" value={form.fat} onChange={e => u('fat')(e.target.value)}
            className={inputCls} placeholder="0" inputMode="decimal" />
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={handleAdd}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors"
      >
        추가
      </button>
    </div>
  );
}

// ── Local DB food row ──────────────────────────────────────────────────────

function FoodRow({ food, onAdd }: { food: FoodItem; onAdd: (item: AddItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [grams, setGrams] = useState(String(food.serving_g));

  const computed = calcNutrition(food, Number(grams) || food.serving_g);

  return (
    <div className="border-b border-zinc-800/50 last:border-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{food.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {food.serving_desc} · {Math.round(food.per100g.kcal * food.serving_g / 100)}kcal
          </p>
        </div>
        <div className="text-xs text-zinc-600 flex gap-2 flex-shrink-0">
          <span className="text-amber-500/70">탄{Math.round(food.per100g.carbs_g * food.serving_g / 100)}g</span>
          <span className="text-blue-500/70">단{Math.round(food.per100g.protein_g * food.serving_g / 100)}g</span>
        </div>
        <Plus size={16} className={`text-blue-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-45' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-zinc-900/50">
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-zinc-400 flex-shrink-0">섭취량 (g)</label>
            <input
              type="number"
              value={grams}
              onChange={e => setGrams(e.target.value)}
              inputMode="numeric"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-blue-500"
            />
          </div>
          <NutritionGrid {...computed} />
          <button
            onClick={() => {
              const g = Number(grams) || food.serving_g;
              onAdd({ food_name: food.name, serving: `${g}g`, ...calcNutrition(food, g) });
              setExpanded(false);
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            추가
          </button>
        </div>
      )}
    </div>
  );
}

// ── FatSecret food row ─────────────────────────────────────────────────────

function FatsecretFoodRow({ food, onAdd }: { food: FsFood; onAdd: (item: AddItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<FsDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [servingIdx, setServingIdx] = useState(0);
  const [count, setCount] = useState('1');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setFetchFailed(false);
    try {
      const res = await fetch(`/api/fatsecret/food?id=${food.id}`);
      if (!res.ok) throw new Error('failed');
      const data: FsDetail = await res.json();
      if (!data.servings?.length) throw new Error('no servings');
      setDetail(data);
    } catch {
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, [food.id]);

  const handleToggle = async () => {
    if (loading) return;
    if (!expanded && !detail && !fetchFailed) {
      await fetchDetail();
    }
    setExpanded(e => !e);
  };

  const serving = detail?.servings[servingIdx];
  const mult = Math.max(0.1, parseFloat(count) || 1);
  const computed = serving
    ? {
        kcal: Math.round(serving.kcal * mult),
        carbs_g: Math.round(serving.carbs_g * mult * 10) / 10,
        protein_g: Math.round(serving.protein_g * mult * 10) / 10,
        fat_g: Math.round(serving.fat_g * mult * 10) / 10,
      }
    : null;

  // Parse quick preview from food_description: "Per 100g - Calories: 165kcal | Fat: 3.57g | ..."
  const kcalMatch = food.description.match(/Calories:\s*([\d.]+)kcal/);
  const perMatch = food.description.match(/^(Per[^-]+)/);
  const previewParts = [
    perMatch ? perMatch[1].trim() : '',
    kcalMatch ? `${Math.round(parseFloat(kcalMatch[1]))}kcal` : '',
  ].filter(Boolean);

  return (
    <div className="border-b border-zinc-800/50 last:border-0">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{food.name}</p>
          {previewParts.length > 0 && (
            <p className="text-xs text-zinc-500 mt-0.5">{previewParts.join(' · ')}</p>
          )}
        </div>
        {loading ? (
          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
        ) : (
          <Plus size={16} className={`text-blue-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-45' : ''}`} />
        )}
      </button>

      {expanded && fetchFailed && (
        <div className="px-4 pb-4 text-center">
          <p className="text-zinc-500 text-xs">영양 정보를 불러올 수 없습니다.</p>
          <button onClick={fetchDetail} className="text-blue-400 text-xs mt-1.5">
            재시도
          </button>
        </div>
      )}

      {expanded && !fetchFailed && detail && (
        <div className="px-4 pb-4 pt-1 bg-zinc-900/50">
          {detail.servings.length > 1 && (
            <div className="mb-3">
              <label className="text-xs text-zinc-400 mb-1.5 block">제공량 선택</label>
              <select
                value={servingIdx}
                onChange={e => { setServingIdx(Number(e.target.value)); setCount('1'); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {detail.servings.map((s, i) => (
                  <option key={s.id} value={i}>{s.description}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-zinc-400 flex-shrink-0">개수 / 배율</label>
            <input
              type="number"
              value={count}
              onChange={e => setCount(e.target.value)}
              inputMode="decimal"
              min="0.1"
              step="0.5"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-blue-500"
            />
          </div>

          {computed && <NutritionGrid {...computed} />}

          <button
            onClick={() => {
              if (!serving || !computed) return;
              const servingLabel = mult === 1
                ? serving.description
                : `${serving.description} × ${mult}`;
              onAdd({ food_name: food.name, serving: servingLabel, ...computed });
              setExpanded(false);
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            추가
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page inner (needs Suspense because of useSearchParams) ─────────────────

function AddMealInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, addMealItem } = useStore();

  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const mealType = (searchParams.get('type') ?? '아침') as MealType;

  const user = currentUser();
  useEffect(() => { if (!user) router.replace('/login'); }, [user, router]);

  const [tab, setTab] = useState<'search' | 'manual'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>(() => searchFoods(''));
  const [fsResults, setFsResults] = useState<FsFood[]>([]);
  const [fsLoading, setFsLoading] = useState(false);

  // Local DB — instant
  useEffect(() => { setResults(searchFoods(query)); }, [query]);

  // FatSecret — debounced 500 ms
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setFsResults([]);
      setFsLoading(false);
      return;
    }
    setFsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/fatsecret/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setFsResults(data.foods ?? []);
      } catch {
        setFsResults([]);
      } finally {
        setFsLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  const handleAdd = useCallback((item: AddItem) => {
    addMealItem(date, mealType, item);
    router.back();
  }, [addMealItem, date, mealType, router]);

  if (!user) return null;

  const hasQuery = query.trim().length >= 2;
  const noResults = hasQuery && results.length === 0 && !fsLoading && fsResults.length === 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-zinc-950/95 backdrop-blur z-10 px-4 pt-10 pb-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-white p-1 -ml-1">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold flex-1">{mealType} 식사 추가</h1>
        </div>

        <div className="flex gap-2 bg-zinc-900 rounded-xl p-1">
          {(['search', 'manual'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400'
              }`}
            >
              {t === 'search' ? '음식 검색' : '직접 입력'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'search' ? (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search bar */}
          <div className="px-4 py-3 sticky top-[108px] bg-zinc-950/95 backdrop-blur z-10">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="음식 이름으로 검색..."
                autoFocus
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <X size={16} />
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-600 mt-1.5 px-1">
              {hasQuery
                ? `식약처 ${results.length}개${fsLoading ? ' + 검색 중...' : fsResults.length > 0 ? ` + FatSecret ${fsResults.length}개` : ''}`
                : `${results.length}개 식품 (식약처 DB)`}
            </p>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 min-h-0">
            {/* Local DB */}
            {results.length > 0 && (
              <div className="bg-zinc-900 rounded-2xl overflow-hidden">
                {hasQuery && (
                  <div className="px-4 py-2 border-b border-zinc-800/50">
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">식약처 DB</p>
                  </div>
                )}
                {results.map(food => (
                  <FoodRow key={food.id} food={food} onAdd={handleAdd} />
                ))}
              </div>
            )}

            {/* FatSecret */}
            {hasQuery && (fsLoading || fsResults.length > 0) && (
              <div className="bg-zinc-900 rounded-2xl overflow-hidden">
                <div className="px-4 py-2 border-b border-zinc-800/50 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">FatSecret</p>
                  {fsLoading && (
                    <div className="w-3 h-3 border border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
                  )}
                </div>
                {fsLoading && fsResults.length === 0 ? (
                  <div className="py-6 text-center text-zinc-600 text-xs">검색 중...</div>
                ) : (
                  fsResults.map(food => (
                    <FatsecretFoodRow key={food.id} food={food} onAdd={handleAdd} />
                  ))
                )}
              </div>
            )}

            {/* No results — suggest manual entry */}
            {noResults && (
              <div className="bg-zinc-900 rounded-2xl p-8 text-center text-zinc-500 text-sm">
                &ldquo;{query}&rdquo; 검색 결과가 없습니다.
                <br />
                <button
                  onClick={() => setTab('manual')}
                  className="text-blue-400 mt-2 block mx-auto"
                >
                  직접 입력하기 →
                </button>
              </div>
            )}

            {/* Default empty state (no query) */}
            {!hasQuery && results.length === 0 && (
              <div className="bg-zinc-900 rounded-2xl p-8 text-center text-zinc-500 text-sm">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-8">
          <p className="text-xs text-zinc-400 mb-4">
            식품 DB에 없는 음식의 영양 정보를 직접 입력하세요.
          </p>
          <ManualForm onAdd={handleAdd} />
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AddMealPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">로딩 중...</div>}>
      <AddMealInner />
    </Suspense>
  );
}
