'use client';
import { useState, useRef, useCallback } from 'react';
import { Camera, RotateCcw, AlertTriangle, Check, Sparkles } from 'lucide-react';
import { FOOD_DB, calcNutrition } from '@/lib/foodData';
import { createClient } from '@/lib/supabase/client';
import {
  candidateIdentityKey,
  selectMeaningfulDatabaseCandidates,
} from '@/lib/visionCandidateValidation';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScannedItem {
  matched: boolean;
  food_id: string | null;
  food_name: string;
  grams: number;
  portion: '적음' | '보통' | '많음';
  confidence: number;
  nutrition: { kcal: number; carbs_g: number; protein_g: number; fat_g: number } | null;
  source?: string;
  reference_name?: string;
  per100g?: Nutrition;
  estimated_per100g?: Nutrition;
  candidates?: ExternalCandidate[];
  needs_variant_confirmation?: boolean;
  vision_candidates?: VisionCandidate[];
  needs_identity_confirmation?: boolean;
  selected_identity?: string;
  nutrition_sources?: WebNutritionSource[];
  nutrition_summary?: string;
  nutrition_confidence_override?: number;
  serving_g?: number;
  serving_desc?: string;
}

type Nutrition = { kcal: number; carbs_g: number; protein_g: number; fat_g: number };

interface VisionCandidate {
  name: string;
  confidence: number;
  reason: string;
}

interface ExternalCandidate {
  id: string;
  name: string;
  brand: string;
  source: '내 음식 DB' | '내부 DB' | '검증 DB' | 'MFDS' | 'OpenFoodFacts' | 'USDA';
  per100g: Nutrition;
  score: number;
  display_name?: string;
  vision_name?: string;
  vision_confidence?: number;
  vision_reason?: string;
  servingG?: number;
  servingDescription?: string;
}

interface WebNutritionSource {
  title: string;
  url: string;
}

interface WebNutritionEstimate {
  name: string;
  per100g: Nutrition;
  confidence: number;
  summary: string;
  sources: WebNutritionSource[];
}

interface PersonalFoodEntry {
  identity: string;
  food_name: string;
  per100g: Nutrition;
  confirmed_at: string;
  serving_g?: number;
  serving_desc?: string;
}

const PERSONAL_FOOD_CACHE_KEY = 'fittrack-photo-food-cache-v1';
const MIN_EXTERNAL_MATCH_SCORE = 50;

function readPersonalFoodCache(): PersonalFoodEntry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PERSONAL_FOOD_CACHE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PersonalFoodEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<PersonalFoodEntry>;
      const nutrition = candidate.per100g;
      return typeof candidate.identity === 'string'
        && typeof candidate.food_name === 'string'
        && Boolean(nutrition)
        && [nutrition?.kcal, nutrition?.carbs_g, nutrition?.protein_g, nutrition?.fat_g]
          .every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    });
  } catch {
    return [];
  }
}

function personalFoodCandidates(query: string): ExternalCandidate[] {
  const identity = candidateIdentityKey(query);
  return readPersonalFoodCache()
    .filter(entry => entry.identity === identity)
    .slice(0, 1)
    .map(entry => ({
      id: entry.identity,
      name: entry.food_name,
      brand: '내가 확인함',
      source: '내 음식 DB' as const,
      per100g: entry.per100g,
      score: 100,
      servingG: entry.serving_g,
      servingDescription: entry.serving_desc,
    }));
}

function internalFoodCandidates(query: string): ExternalCandidate[] {
  const identity = candidateIdentityKey(query);
  return FOOD_DB
    .filter(food => candidateIdentityKey(food.name) === identity)
    .slice(0, 3)
    .map(food => ({
      id: food.id,
      name: food.name,
      brand: 'FitTrack 대표값',
      source: '내부 DB' as const,
      per100g: food.per100g,
      score: 100,
      servingG: food.serving_g,
      servingDescription: food.serving_desc,
    }));
}

function estimatedServing(grams: number, portion: ScannedItem['portion']) {
  const factor = portion === '적음' ? 0.75 : portion === '많음' ? 1.5 : 1;
  return Math.max(5, Math.round(grams / factor / 5) * 5);
}

function plausibleAgainstVisionEstimate(candidate: ExternalCandidate, estimate?: Nutrition) {
  if (!estimate || ['내 음식 DB', '내부 DB', '검증 DB', 'MFDS'].includes(candidate.source)) return true;
  if (estimate.kcal < 15 || candidate.per100g.kcal < 1) return true;
  const ratio = candidate.per100g.kcal / estimate.kcal;
  return ratio >= 0.35 && ratio <= 2.5;
}

function isMeaningfulDatabaseMatch(candidate: ExternalCandidate) {
  return ['내 음식 DB', '내부 DB'].includes(candidate.source)
    || candidate.score >= MIN_EXTERNAL_MATCH_SCORE;
}

function rememberConfirmedFoods(rows: Row[]) {
  try {
    const cache = readPersonalFoodCache();
    const byIdentity = new Map(cache.map(entry => [entry.identity, entry]));
    rows.forEach(row => {
      if (!row.per100g || row.source === '내부 DB' || row.source === '내 음식 DB') return;
      const identity = candidateIdentityKey(row.food_name);
      if (!identity) return;
      byIdentity.set(identity, {
        identity,
        food_name: row.food_name,
        per100g: row.per100g,
        confirmed_at: new Date().toISOString(),
        serving_g: row.serving_g,
        serving_desc: row.serving_desc,
      });
    });
    window.localStorage.setItem(
      PERSONAL_FOOD_CACHE_KEY,
      JSON.stringify([...byIdentity.values()].slice(-200)),
    );
  } catch {
    // 캐시는 편의 기능이다. 저장 실패가 식단 기록을 막으면 안 된다.
  }
}

interface AddItem {
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
}

type Row = ScannedItem & { selected: boolean };

function nutritionFor(per100g: Nutrition, grams: number): Nutrition {
  const ratio = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * ratio),
    carbs_g: Math.round(per100g.carbs_g * ratio * 10) / 10,
    protein_g: Math.round(per100g.protein_g * ratio * 10) / 10,
    fat_g: Math.round(per100g.fat_g * ratio * 10) / 10,
  };
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function candidateScore(query: string, name: string) {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.includes(q)) return 80;
  if (q.includes(n)) return 65;

  const queryTokens = query.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean);
  const nameTokens = new Set(name.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean));
  return queryTokens.length
    ? Math.round(queryTokens.filter(token => nameTokens.has(token)).length / queryTokens.length * 50)
    : 0;
}

function isGenericCola(value: string) {
  const n = normalizeName(value);
  const isCola = n.includes('콜라') || n.includes('cocacola') || n === 'cola';
  const hasVariant = n.includes('제로') || n.includes('zero') || n.includes('다이어트') || n.includes('diet');
  return isCola && !hasVariant;
}

function isZeroCola(value: string) {
  const n = normalizeName(value);
  const isCola = n.includes('콜라') || n.includes('cocacola') || n.includes('cola');
  return isCola && (n.includes('제로') || n.includes('zero') || n.includes('다이어트') || n.includes('diet'));
}

function isZeroColaCandidate(candidate: ExternalCandidate) {
  const n = normalizeName(`${candidate.name} ${candidate.brand}`);
  return n.includes('제로') || n.includes('zero') || n.includes('다이어트') || n.includes('dietcola');
}

function isRegularColaCandidate(candidate: ExternalCandidate) {
  const n = normalizeName(`${candidate.name} ${candidate.brand}`);
  const isCola = n.includes('콜라') || n.includes('cocacola') || n.includes('cola');
  return isCola && !isZeroColaCandidate(candidate);
}

function hasColaVariantCandidates(candidates: ExternalCandidate[]) {
  return candidates.some(isRegularColaCandidate) && candidates.some(isZeroColaCandidate);
}

async function searchExternalFoods(query: string): Promise<ExternalCandidate[]> {
  const hasHangul = /[가-힣]/.test(query);
  const lookups = isGenericCola(query) ? [query, '제로콜라'] : [query];
  const collected: ExternalCandidate[] = [];

  const validNutrition = (value: unknown): value is Nutrition => {
    if (!value || typeof value !== 'object') return false;
    const nutrition = value as Partial<Nutrition>;
    const values = [nutrition.kcal, nutrition.carbs_g, nutrition.protein_g, nutrition.fat_g];
    return values.every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0)
      && Number(nutrition.kcal) <= 900
      && values.slice(1).every(number => Number(number) <= 100);
  };

  const loadVerifiedCache = async (lookup: string) => {
    try {
      const supabase = createClient();
      const response = await Promise.race([
        supabase.rpc('search_brand_foods', {
          p_query: lookup,
          p_limit: 10,
        }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 2500)),
      ]);
      if (!response) return [];
      const { data, error } = response;
      if (error) return [];

      return ((data ?? []) as Array<Record<string, unknown>>).flatMap(row => {
        const servingG = Number(row.serving_g);
        const total = {
          kcal: Number(row.kcal),
          carbs_g: Number(row.carbs_g),
          protein_g: Number(row.protein_g),
          fat_g: Number(row.fat_g),
        };
        const confidence = Number(row.macro_confidence);
        if (!(servingG > 0) || !validNutrition(total) || confidence < 0.8) return [];
        const ratio = 100 / servingG;
        const per100g: Nutrition = {
          kcal: Math.round(total.kcal * ratio),
          carbs_g: Math.round(total.carbs_g * ratio * 10) / 10,
          protein_g: Math.round(total.protein_g * ratio * 10) / 10,
          fat_g: Math.round(total.fat_g * ratio * 10) / 10,
        };
        const name = String(row.menu_name ?? '').trim();
        if (!name) return [];
        return [{
          id: String(row.external_id ?? `cache-${row.brand_name}-${name}`),
          name,
          brand: String(row.brand_name ?? ''),
          source: '검증 DB' as const,
          per100g,
          score: Math.max(
            candidateScore(lookup, name),
            candidateScore(lookup, `${row.brand_name ?? ''} ${name}`),
          ),
          servingG,
          servingDescription: `${servingG}g`,
        }];
      });
    } catch {
      return [];
    }
  };

  const loadApi = async (
    source: 'MFDS' | 'OpenFoodFacts' | 'USDA',
    lookup: string,
  ) => {
    try {
      const endpoint = source === 'MFDS'
        ? '/api/mfds/search'
        : source === 'OpenFoodFacts'
          ? '/api/openfoodfacts/search'
          : '/api/usda/search';
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(lookup)}`);
      if (!res.ok) return [];
      const json = await res.json();
      const scoreQuery = typeof json.translatedQuery === 'string' ? json.translatedQuery : lookup;
      return ((json.foods ?? []) as Array<{
        id: string;
        name: string;
        brand?: string;
        per100g: Partial<Nutrition>;
        servingG?: number | null;
        servingDescription?: string;
      }>).flatMap(food => {
        if (!food.name || !validNutrition(food.per100g)) return [];
        return [{
          id: String(food.id),
          name: food.name,
          brand: food.brand ?? '',
          source,
          per100g: food.per100g,
          score: Math.max(
            candidateScore(scoreQuery, food.name),
            candidateScore(scoreQuery, `${food.brand ?? ''} ${food.name}`),
          ),
          servingG: typeof food.servingG === 'number' && food.servingG > 0
            ? food.servingG
            : undefined,
          servingDescription: food.servingDescription,
        }];
      });
    } catch {
      return [];
    }
  };

  const lookupResults = await Promise.all(lookups.map(async lookup => {
    const found: ExternalCandidate[] = [];
    const personal = personalFoodCandidates(lookup);
    found.push(...personal);
    if (personal.some(food => food.score >= 65)) return found;
    const internal = internalFoodCandidates(lookup);
    found.push(...internal);
    if (internal.some(food => food.score >= 65)) return found;
    if (hasHangul) {
      const cached = await loadVerifiedCache(lookup);
      found.push(...cached);
      if (!cached.some(food => food.score >= 65)) {
        const mfds = await loadApi('MFDS', lookup);
        found.push(...mfds);
        if (![...cached, ...mfds].some(food => food.score >= 65)) {
          found.push(...await loadApi('USDA', lookup));
        }
      }
    } else {
      const results = await Promise.all([
        loadApi('USDA', lookup),
        loadApi('OpenFoodFacts', lookup),
      ]);
      found.push(...results.flat());
    }
    return found;
  }));
  collected.push(...lookupResults.flat());

  const priority: Record<ExternalCandidate['source'], number> = {
    '내 음식 DB': 6,
    '내부 DB': 5,
    '검증 DB': 4,
    MFDS: 3,
    USDA: 2,
    OpenFoodFacts: 1,
  };
  const unique = new Map<string, ExternalCandidate>();
  collected.forEach(food => {
    const key = normalizeName(`${food.brand} ${food.name}`);
    const previous = unique.get(key);
    if (!previous || priority[food.source] > priority[previous.source]) unique.set(key, food);
  });

  const sorted = [...unique.values()]
    .filter(food => food.name && food.per100g && Number.isFinite(food.per100g.kcal))
    .sort((a, b) => b.score - a.score || priority[b.source] - priority[a.source] || a.name.length - b.name.length);

  if (isZeroCola(query)) {
    const zero = sorted
      .filter(isZeroColaCandidate)
      .sort((a, b) => a.per100g.kcal - b.per100g.kcal || b.score - a.score)[0];
    return zero ? [{ ...zero, display_name: '코카콜라 제로' }] : [];
  }
  // 외부 DB에는 같은 음식명이 제조사/레코드별로 반복될 수 있다. 사진으로
  // 구분할 수 없는 동의어·동일 이름은 대표 한 건만 사용자 후보로 노출한다.
  if (!isGenericCola(query)) return selectMeaningfulDatabaseCandidates(sorted);

  const regular = sorted.find(isRegularColaCandidate);
  const zero = [...unique.values()]
    .filter(food => food.name && isZeroColaCandidate(food))
    .sort((a, b) => a.per100g.kcal - b.per100g.kcal || a.name.length - b.name.length)[0];
  // 출처별 중복을 보여주지 않고 사용자가 판단해야 하는 의미만 남긴다.
  // 콜라는 일반/제로 두 가지뿐이며, 각 의미마다 대표 DB 항목 한 건만 사용한다.
  const colaCandidates: ExternalCandidate[] = [];
  if (regular) colaCandidates.push({ ...regular, display_name: '일반 코카콜라' });
  if (zero) colaCandidates.push({ ...zero, display_name: '코카콜라 제로' });
  return colaCandidates;
}

async function searchWebNutrition(query: string): Promise<WebNutritionEstimate | null> {
  try {
    const response = await fetch(`/api/nutrition/web-estimate?q=${encodeURIComponent(query)}`);
    if (!response.ok) return null;
    const payload = await response.json() as { estimate?: WebNutritionEstimate | null };
    const estimate = payload.estimate;
    if (!estimate?.per100g) return null;
    const values = [
      estimate.per100g.kcal,
      estimate.per100g.carbs_g,
      estimate.per100g.protein_g,
      estimate.per100g.fat_g,
    ];
    if (!values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return null;
    return estimate;
  } catch {
    return null;
  }
}

// ── 이미지 리사이즈 (업로드 전 클라이언트에서) ─────────────────────────────
// 원본 4000px 그대로 보내면 토큰만 먹고 인식률은 그대로다.

// 작은 반찬의 형태·튀김 단면·포장 글자를 보존한다. 640px에서는 한 상 사진의
// 개별 음식이 수십 픽셀까지 줄어 세부 메뉴와 브랜드 판별력이 크게 떨어졌다.
const MAX_EDGE = 1024;

function resizeToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas 를 사용할 수 없습니다.'));
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽지 못했습니다.'));
    };
    img.src = url;
  });
}

// ── 결과 행 ────────────────────────────────────────────────────────────────

function ResultRow({
  row,
  onToggle,
  onGrams,
  onCandidate,
  onIdentity,
}: {
  row: Row;
  onToggle: () => void;
  onGrams: (g: number) => void;
  onCandidate: (candidate: ExternalCandidate) => void;
  onIdentity: (candidate: VisionCandidate) => void;
}) {
  const lowConfidence = row.confidence < 0.9;
  const servingG = row.serving_g ?? estimatedServing(row.grams, row.portion);
  const servingLabel = row.serving_desc ?? `추정 1인분 (${servingG}g)`;

  return (
    <div className={`border-b border-zinc-200 px-4 py-4 last:border-0 ${row.selected ? '' : 'opacity-45'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          disabled={row.needs_identity_confirmation}
          title={row.needs_identity_confirmation ? '음식 후보를 먼저 선택해주세요' : undefined}
          aria-label={row.selected ? '제외' : '포함'}
          className={`mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
            row.selected ? 'bg-blue-600' : 'border border-zinc-200 bg-zinc-100'
          }`}
        >
          {row.selected && <Check size={14} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white">{row.food_name}</p>
            {!row.matched && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                DB 없음
              </span>
            )}
            {row.source && row.source !== '내부 DB' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                row.source === 'AI 추정'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}>
                {row.source}
              </span>
            )}
            {row.needs_variant_confirmation && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                일반/제로 확인 필요
              </span>
            )}
            {row.needs_identity_confirmation && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">
                음식 종류 확인 필요
              </span>
            )}
            {row.matched && lowConfidence && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                확실하지 않음
              </span>
            )}
          </div>

          {row.matched ? (
            <>
              {row.vision_candidates && row.vision_candidates.length > 1 && (
                <div className="mt-2">
                  <p className="text-[11px] text-zinc-500 mb-1.5">
                    사진 분석 후보{row.needs_identity_confirmation ? ' — 하나를 선택해주세요' : ''}
                  </p>
                  <div className="grid gap-1.5">
                    {row.vision_candidates.map(candidate => (
                      <button
                        key={candidate.name}
                        onClick={() => onIdentity(candidate)}
                        className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left ${
                          row.selected_identity === candidate.name
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-zinc-200 bg-white text-zinc-700'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-medium">{candidate.name}</span>
                          <span className="text-zinc-500">{Math.round(candidate.confidence * 100)}%</span>
                        </span>
                        {candidate.reason && (
                          <span className="block text-[10px] mt-0.5 text-zinc-500">{candidate.reason}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {row.reference_name && (
                <p className="text-[11px] text-zinc-500 mt-1">
                  {row.source === '내부 DB' || row.source === '검증 DB'
                    ? `영양정보 기준: ${row.food_name}`
                    : row.source === '내 음식 DB'
                      ? `영양정보 기준: 이전에 확인한 ${row.food_name}`
                    : row.source === '웹 검색'
                      ? `영양정보: 웹 검색 평균 · ${row.nutrition_sources?.length ?? 0}개 출처`
                    : row.source === 'AI 추정'
                      ? '영양정보: AI 추정값 — 확인 후 포함해주세요'
                      : `영양정보: ${row.source} 유사 음식 기준 자동 계산`}
                </p>
              )}
              {row.source === '웹 검색' && row.nutrition_summary && (
                <p className="text-[10px] text-zinc-600 mt-1">{row.nutrition_summary}</p>
              )}
              {row.source === '웹 검색' && row.nutrition_sources && row.nutrition_sources.length > 0 && (
                <details className="mt-1 text-[10px] text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-300">근거 보기</summary>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                    {row.nutrition_sources.slice(0, 3).map(source => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                </details>
              )}
              {row.candidates && row.candidates.length > 1
                && (row.needs_variant_confirmation || hasColaVariantCandidates(row.candidates))
                && !(row.vision_candidates && row.vision_candidates.length > 1) && (
                <div className="grid gap-1.5 mt-2">
                  {row.candidates.map(candidate => (
                    <button
                      key={`${candidate.source}-${candidate.id}`}
                      onClick={() => onCandidate(candidate)}
                      className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left ${
                        row.selected && row.food_id === `${candidate.source}:${candidate.id}`
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-zinc-200 bg-white text-zinc-600'
                      }`}
                    >
                      <span className="block text-[11px] truncate">{candidate.display_name ?? candidate.vision_name ?? candidate.name}</span>
                      <span className="block text-[10px] mt-0.5 opacity-75">
                        {[candidate.name, candidate.brand, candidate.source, `${candidate.per100g.kcal}kcal/100g`, `탄수 ${candidate.per100g.carbs_g}g`]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* 양 조절 — 숫자 입력 대신 탭 위주 */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {[
                  { ratio: 0.5, label: '반만' },
                  { ratio: 0.75, label: '조금 적게' },
                  { ratio: 1, label: '1인분' },
                  { ratio: 1.5, label: '곱빼기' },
                ].map(option => {
                  const g = Math.max(1, Math.round(servingG * option.ratio));
                  const active = row.grams === g;
                  return (
                    <button
                      key={option.ratio}
                      onClick={() => onGrams(g)}
                      title={option.ratio === 1 ? servingLabel : `${option.label} (${g}g)`}
                      aria-label={`${option.label}, ${g}g으로 변경`}
                      aria-pressed={active}
                      className={`min-h-11 rounded-xl px-3 py-2 text-[11px] font-medium transition-colors ${
                        active
                          ? 'bg-blue-600 text-white ring-1 ring-blue-600'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
                <input
                  type="number"
                  value={row.grams}
                  onChange={e => onGrams(Math.max(1, Number(e.target.value) || 1))}
                  inputMode="numeric"
                  className="h-11 w-16 rounded-xl border border-zinc-200 bg-white px-2 text-right text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-zinc-500">g</span>
              </div>

              <p className="text-xs text-zinc-400 mt-2">
                <span className="text-white font-semibold">{row.nutrition?.kcal ?? 0}</span> kcal
                <span className="text-zinc-600 mx-1.5">·</span>
                <span className="text-amber-400">탄 {row.nutrition?.carbs_g ?? 0}g</span>
                <span className="text-zinc-600 mx-1.5">·</span>
                <span className="text-blue-400">단 {row.nutrition?.protein_g ?? 0}g</span>
                <span className="text-zinc-600 mx-1.5">·</span>
                <span className="text-rose-400">지 {row.nutrition?.fat_g ?? 0}g</span>
              </p>
            </>
          ) : (
            <>
              {row.vision_candidates && row.vision_candidates.length > 1 && (
                <div className="grid gap-1.5 mt-2">
                  {row.vision_candidates.map(candidate => (
                    <button
                      key={candidate.name}
                      onClick={() => onIdentity(candidate)}
                      className="w-full px-2.5 py-2 rounded-md border border-zinc-700 bg-zinc-800 text-left"
                    >
                      <span className="flex justify-between text-[11px] text-zinc-300">
                        <span>{candidate.name}</span>
                        <span className="text-zinc-500">{Math.round(candidate.confidence * 100)}%</span>
                      </span>
                      {candidate.reason && <span className="block text-[10px] mt-0.5 text-zinc-500">{candidate.reason}</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-zinc-500 mt-1.5">
                영양정보 후보를 찾지 못했습니다. 검색이나 직접 입력을 써주세요.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────────────────────────

export default function PhotoMealScanner({
  onAddMany,
}: {
  onAddMany: (items: AddItem[]) => void | Promise<void>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setRows(null);
    setError('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setRows(null);
    setLoading(true);
    try {
      const { data, mimeType } = await resizeToBase64(file);
      setPreview(`data:${mimeType};base64,${data}`);

      const res = await fetch('/api/vision/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data, mimeType }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? '음식 인식에 실패했습니다.');
        return;
      }
      if (!json.is_food || json.items.length === 0) {
        setError('사진에서 음식을 찾지 못했습니다. 음식이 잘 보이게 다시 찍어주세요.');
        return;
      }

      const recognizedRows: Row[] = (json.items as ScannedItem[]).map(it => ({
          ...it,
          serving_g: it.serving_g ?? estimatedServing(it.grams, it.portion),
          serving_desc: it.serving_desc
            ?? `추정 1인분 (${estimatedServing(it.grams, it.portion)}g)`,
          source: it.matched ? '내부 DB' : undefined,
          selected_identity: it.needs_identity_confirmation ? undefined : it.vision_candidates?.[0]?.name,
          selected: it.matched
            && it.confidence >= 0.9
            && !it.needs_identity_confirmation
            && !it.needs_variant_confirmation,
        }));

      const enrichedRows = await Promise.all(
        recognizedRows.map(async row => {
          const alreadyExactInternalMatch = row.matched
            && !row.needs_identity_confirmation
            && normalizeName(row.food_name) === normalizeName(row.reference_name ?? row.food_name);
          if (alreadyExactInternalMatch) return row;

          // 콜라는 DB 출처가 아니라 일반/제로라는 의미 두 개만 보여준다.
          if (isGenericCola(row.food_name)) {
            const candidates = await searchExternalFoods(row.food_name);
            const best = candidates[0];
            if (!best) return { ...row, selected: false, needs_variant_confirmation: true };

            return {
              ...row,
              matched: true,
              food_id: `${best.source}:${best.id}`,
              source: best.source,
              reference_name: best.name,
              per100g: best.per100g,
              serving_g: best.servingG ?? row.serving_g,
              serving_desc: best.servingDescription ?? row.serving_desc,
              candidates,
              nutrition: nutritionFor(best.per100g, row.grams),
              selected: false,
              vision_candidates: undefined,
              needs_identity_confirmation: false,
              needs_variant_confirmation: true,
            };
          }

          const identities = row.vision_candidates?.slice(0, 3) ?? [];
          const identityMatches = identities.length > 1
            ? await Promise.all(identities.map(async identity => {
              const found = await searchExternalFoods(identity.name);
                const best = found.find(candidate =>
                  isMeaningfulDatabaseMatch(candidate)
                  && plausibleAgainstVisionEstimate(candidate, row.estimated_per100g),
                );
                return best ? {
                  ...best,
                  display_name: identity.name,
                  vision_name: identity.name,
                  vision_confidence: identity.confidence,
                  vision_reason: identity.reason,
                } : null;
              }))
            : [];

          const directCandidates: ExternalCandidate[] = [];
          identityMatches.forEach(candidate => {
            if (candidate) directCandidates.push(candidate);
          });
          const fallbackCandidates = directCandidates.length === 0
            ? (await searchExternalFoods(row.food_name))
                .filter(candidate => isMeaningfulDatabaseMatch(candidate)
                  && plausibleAgainstVisionEstimate(candidate, row.estimated_per100g))
            : [];
          const candidates = directCandidates.length > 0 ? directCandidates : fallbackCandidates;
          const best = candidates[0];

          if (row.needs_identity_confirmation) {
            return {
              ...row,
              candidates,
              selected: false,
              selected_identity: undefined,
            };
          }

          if (!best) {
            const webEstimate = await searchWebNutrition(row.food_name);
            if (webEstimate) {
              return {
                ...row,
                matched: true,
                food_id: `web-estimate:${normalizeName(row.food_name)}`,
                source: '웹 검색',
                reference_name: webEstimate.name || row.food_name,
                per100g: webEstimate.per100g,
                nutrition: nutritionFor(webEstimate.per100g, row.grams),
                nutrition_sources: webEstimate.sources,
                nutrition_summary: webEstimate.summary,
                nutrition_confidence_override: webEstimate.confidence,
                selected: false,
              };
            }
            if (!row.estimated_per100g) return row;
            return {
              ...row,
              matched: true,
              food_id: `ai-estimate:${normalizeName(row.food_name)}`,
              source: 'AI 추정',
              reference_name: row.food_name,
              per100g: row.estimated_per100g,
              nutrition: nutritionFor(row.estimated_per100g, row.grams),
              selected: false,
            };
          }

          return {
            ...row,
            matched: true,
            food_id: `${best.source}:${best.id}`,
            source: best.source,
            reference_name: best.name,
            per100g: best.per100g,
            serving_g: best.servingG ?? row.serving_g,
            serving_desc: best.servingDescription ?? row.serving_desc,
            candidates,
            nutrition: nutritionFor(best.per100g, row.grams),
            // 모델이 확신하고 DB 유사도도 충분할 때만 기본 선택한다.
            // 애매한 반찬/세부 메뉴는 사용자가 체크해야 식단에 포함된다.
            // 사용자가 이전에 직접 확정한 동일 음식은 모델 점수가 조금 낮아도
            // 다시 해석하게 하지 않는다. 그 외 자동 선택은 보수적으로 유지한다.
            selected: best.source === '내 음식 DB'
              || (row.confidence >= 0.9 && best.score >= 65),
            selected_identity: best.vision_name ?? row.selected_identity,
          };
        }),
      );
      setRows(enrichedRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateGrams = (idx: number, grams: number) => {
    setRows(prev =>
      prev?.map((r, i) => {
        if (i !== idx) return r;
        const food = r.food_id ? FOOD_DB.find(f => f.id === r.food_id) : undefined;
        const nutrition = food
          ? calcNutrition(food, grams)
          : r.per100g
            ? nutritionFor(r.per100g, grams)
            : r.nutrition;
        return { ...r, grams, nutrition };
      }) ?? null,
    );
  };

  const chooseCandidate = (idx: number, candidate: ExternalCandidate) => {
    setRows(prev => prev?.map((r, i) => i === idx ? {
      ...r,
      matched: true,
      food_id: `${candidate.source}:${candidate.id}`,
      source: candidate.source,
      reference_name: candidate.name,
      per100g: candidate.per100g,
      serving_g: candidate.servingG ?? r.serving_g,
      serving_desc: candidate.servingDescription ?? r.serving_desc,
      nutrition: nutritionFor(candidate.per100g, r.grams),
      food_name: candidate.display_name ?? candidate.vision_name ?? r.food_name,
      selected: true,
      selected_identity: candidate.vision_name ?? candidate.display_name ?? r.selected_identity,
      needs_variant_confirmation: false,
      needs_identity_confirmation: false,
    } : r) ?? null);
  };

  const chooseIdentity = async (idx: number, identity: VisionCandidate) => {
    const current = rows?.[idx];
    if (!current) return;

    setError('');
    setLoading(true);
    try {
      let dbMatch = current.candidates?.find(candidate => candidate.vision_name === identity.name);
      if (!dbMatch) {
        const candidates = await searchExternalFoods(identity.name);
        dbMatch = candidates.find(candidate =>
          isMeaningfulDatabaseMatch(candidate)
            && plausibleAgainstVisionEstimate(candidate, current.estimated_per100g),
        );
      }

      if (dbMatch) {
        setRows(prev => prev?.map((r, i) => i === idx ? {
          ...r,
          matched: true,
          food_id: `${dbMatch.source}:${dbMatch.id}`,
          food_name: identity.name,
          source: dbMatch.source,
          reference_name: dbMatch.name,
          per100g: dbMatch.per100g,
          serving_g: dbMatch.servingG ?? r.serving_g,
          serving_desc: dbMatch.servingDescription ?? r.serving_desc,
          nutrition: nutritionFor(dbMatch.per100g, r.grams),
          selected: true,
          selected_identity: identity.name,
          needs_identity_confirmation: false,
        } : r) ?? null);
        return;
      }

      const webEstimate = await searchWebNutrition(identity.name);
      if (webEstimate) {
        setRows(prev => prev?.map((r, i) => i === idx ? {
          ...r,
          matched: true,
          food_id: `web-estimate:${normalizeName(identity.name)}`,
          food_name: identity.name,
          source: '웹 검색',
          reference_name: webEstimate.name || identity.name,
          per100g: webEstimate.per100g,
          nutrition: nutritionFor(webEstimate.per100g, r.grams),
          nutrition_sources: webEstimate.sources,
          nutrition_summary: webEstimate.summary,
          nutrition_confidence_override: webEstimate.confidence,
          selected: true,
          selected_identity: identity.name,
          needs_identity_confirmation: false,
        } : r) ?? null);
        return;
      }

      setRows(prev => prev?.map((r, i) => {
        if (i !== idx) return r;
        if (r.estimated_per100g) {
          return {
            ...r,
            matched: true,
            food_id: `ai-estimate:${normalizeName(identity.name)}`,
            food_name: identity.name,
            source: 'AI 추정',
            reference_name: identity.name,
            per100g: r.estimated_per100g,
            nutrition: nutritionFor(r.estimated_per100g, r.grams),
            selected: false,
            selected_identity: identity.name,
            needs_identity_confirmation: false,
          };
        }
        return {
          ...r,
          matched: false,
          food_id: null,
          food_name: identity.name,
          source: undefined,
          reference_name: undefined,
          per100g: undefined,
          nutrition: null,
          selected: false,
          selected_identity: identity.name,
          needs_identity_confirmation: false,
        };
      }) ?? null);
    } catch {
      setError('선택한 음식의 영양정보를 불러오지 못했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (idx: number) =>
    setRows(prev => prev?.map((r, i) => {
      if (i !== idx || r.needs_identity_confirmation) return r;

      if (r.needs_variant_confirmation) {
        const current = r.candidates?.find(candidate =>
          `${candidate.source}:${candidate.id}` === r.food_id,
        );
        return {
          ...r,
          food_name: current?.display_name ?? r.food_name,
          selected: true,
          selected_identity: current?.display_name ?? r.selected_identity,
          needs_variant_confirmation: false,
        };
      }

      return { ...r, selected: !r.selected };
    }) ?? null);

  const selected = rows?.filter(r => r.selected && r.matched && r.nutrition) ?? [];
  const total = selected.reduce(
    (acc, r) => ({
      kcal: acc.kcal + (r.nutrition?.kcal ?? 0),
      carbs_g: Math.round((acc.carbs_g + (r.nutrition?.carbs_g ?? 0)) * 10) / 10,
      protein_g: Math.round((acc.protein_g + (r.nutrition?.protein_g ?? 0)) * 10) / 10,
      fat_g: Math.round((acc.fat_g + (r.nutrition?.fat_g ?? 0)) * 10) / 10,
    }),
    { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 },
  );

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      rememberConfirmedFoods(selected);
      await onAddMany(
        selected.map(r => ({
        food_name: r.food_name,
        serving: `${r.grams}g (사진)`,
        kcal: r.nutrition!.kcal,
        carbs_g: r.nutrition!.carbs_g,
        protein_g: r.nutrition!.protein_g,
        fat_g: r.nutrition!.fat_g,
          nutrition_status: r.source === '웹 검색'
            ? 'web_grounded'
            : r.source === 'AI 추정'
              ? 'estimated'
              : 'database',
          nutrition_confidence: r.nutrition_confidence_override ?? r.confidence,
          nutrition_source: r.source ?? '내부 DB',
          nutrition_meta: {
            input: 'photo',
            reference_name: r.reference_name ?? null,
            vision_candidates: r.vision_candidates ?? [],
            nutrition_summary: r.nutrition_summary ?? null,
            nutrition_sources: r.nutrition_sources ?? [],
          },
        })),
      );
    } catch {
      setError('음식 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={preview || loading || rows || error ? 'overflow-hidden rounded-3xl border border-blue-500/15 bg-gradient-to-br from-blue-500/10 via-zinc-900/70 to-zinc-950 px-4 pt-4 pb-5' : ''}>
      {/* 카메라 촬영 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      
      {/* 앨범 / 저장된 이미지 선택 */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      
      {/* 촬영 전 */}
      {!preview && !loading && (
        <div className="apple-card w-full overflow-hidden p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-500/10">
              <Camera size={22} className="text-blue-400" />
            </div>
      
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold">사진으로 음식 찾기</p>
                <Sparkles size={13} className="text-blue-400" />
              </div>
      
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                음식 사진을 촬영하거나 앨범에서 선택하면 AI가 음식을 인식하고 영양정보를 찾아드려요.
              </p>
      
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="apple-accent-surface flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  사진 촬영
                </button>
      
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200"
                >
                  앨범에서 선택
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 미리보기 */}
      {preview && (
        <div className="relative mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="촬영한 음식" className="w-full rounded-2xl" />
          <button
            onClick={reset}
            className="absolute top-2 right-2 bg-black/60 backdrop-blur text-white rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            <RotateCcw size={13} /> 다시 찍기
          </button>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="bg-zinc-900 rounded-2xl py-10 flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">음식을 분석하는 중...</p>
        </div>
      )}

      {/* 에러 */}
      {error && !loading && (
        <div className="bg-zinc-900 rounded-2xl p-5 flex gap-3">
          <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-zinc-300">{error}</p>
            <button onClick={reset} className="text-blue-400 text-xs mt-2">
              다시 시도 →
            </button>
          </div>
        </div>
      )}

      {/* 결과 */}
      {rows && !loading && (
        <>
          <div className="apple-card mb-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-800/50">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                인식 결과 {rows.length}개 — 맞는지 확인해주세요
              </p>
            </div>
            {rows.map((row, i) => (
              <ResultRow
                key={`${row.food_id ?? row.food_name}-${i}`}
                row={row}
                onToggle={() => toggle(i)}
                onGrams={g => updateGrams(i, g)}
                onCandidate={candidate => chooseCandidate(i, candidate)}
                onIdentity={candidate => chooseIdentity(i, candidate)}
              />
            ))}
          </div>

          <div className="apple-card mb-4 p-4">
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-xs text-zinc-400">선택한 {selected.length}개 합계</p>
              <p className="text-xl font-bold text-white">
                {total.kcal}
                <span className="text-sm font-normal text-zinc-500 ml-1">kcal</span>
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              탄 {total.carbs_g}g · 단 {total.protein_g}g · 지 {total.fat_g}g
            </p>
          </div>

          <button
            onClick={submit}
            disabled={selected.length === 0 || submitting}
            className="apple-accent-surface min-h-14 w-full rounded-2xl bg-blue-600 py-3.5 font-semibold text-white transition-colors hover:bg-blue-500 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            {submitting
              ? '저장 중...'
              : selected.length > 0
                ? `${selected.length}개 추가`
                : '추가할 음식을 선택해주세요'}
          </button>
        </>
      )}
    </div>
  );
}
