'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import BottomNav from '@/components/BottomNav';
import { ChevronLeft, ChevronRight, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import type { MealType } from '@/lib/types';

const MEAL_TYPES: MealType[] = ['아침', '점심', '저녁', '간식'];
const MEAL_GOALS = { kcal: 2000, carbs_g: 250, protein_g: 150, fat_g: 55 };

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function offsetDate(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateKey: string): string {
  const today = todayKey();
  const yesterday = offsetDate(today, -1);
  if (dateKey === today) return '오늘';
  if (dateKey === yesterday) return '어제';
  const [y, m, d] = dateKey.split('-');
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300 font-medium">
          {Math.round(value)}<span className="text-zinc-500">/{goal}{label === '칼로리' ? 'kcal' : 'g'}</span>
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MealsPage() {
  const router = useRouter();
  const { currentUser, getMealsByDate, getDailyNutrition, removeMealItem } = useStore();
  const [date, setDate] = useState(todayKey());
  const user = currentUser();

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  if (!user) return null;

  const meals = getMealsByDate(date);
  const nutrition = getDailyNutrition(date);
  const isToday = date === todayKey();

  const mealsByType = MEAL_TYPES.map(type => ({
    type,
    log: meals.find(m => m.meal_type === type) ?? null,
  }));

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="px-4 pt-12 pb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold">식단</h1>
      </div>

      {/* Date navigator */}
      <div className="px-4 flex items-center justify-between mb-4">
        <button
          onClick={() => setDate(d => offsetDate(d, -1))}
          className="p-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="font-semibold text-sm">{formatDateLabel(date)}</p>
        <button
          onClick={() => setDate(d => offsetDate(d, 1))}
          disabled={isToday}
          className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Daily nutrition summary */}
      <div className="mx-4 mb-5 bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-bold">{Math.round(nutrition.kcal)}</p>
            <p className="text-xs text-zinc-400">/ {MEAL_GOALS.kcal} kcal</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: '탄수', value: nutrition.carbs_g, color: 'text-amber-400' },
              { label: '단백', value: nutrition.protein_g, color: 'text-blue-400' },
              { label: '지방', value: nutrition.fat_g, color: 'text-rose-400' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className={`text-base font-bold ${color}`}>{Math.round(value)}g</p>
                <p className="text-[10px] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2.5">
          <MacroBar label="칼로리" value={nutrition.kcal} goal={MEAL_GOALS.kcal} color="bg-emerald-500" />
          <MacroBar label="탄수화물" value={nutrition.carbs_g} goal={MEAL_GOALS.carbs_g} color="bg-amber-500" />
          <MacroBar label="단백질" value={nutrition.protein_g} goal={MEAL_GOALS.protein_g} color="bg-blue-500" />
          <MacroBar label="지방" value={nutrition.fat_g} goal={MEAL_GOALS.fat_g} color="bg-rose-500" />
        </div>
      </div>

      {/* Meal sections */}
      <div className="px-4 space-y-3">
        {mealsByType.map(({ type, log }) => {
          const typeKcal = log?.items.reduce((s, i) => s + i.kcal, 0) ?? 0;
          return (
            <div key={type} className="bg-zinc-900 rounded-2xl overflow-hidden">
              {/* Section header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{type}</span>
                  {typeKcal > 0 && (
                    <span className="text-xs text-zinc-500">{Math.round(typeKcal)} kcal</span>
                  )}
                </div>
                <Link
                  href={`/meals/add?date=${date}&type=${type}`}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
                >
                  <Plus size={14} />
                  추가
                </Link>
              </div>

              {/* Items */}
              {log && log.items.length > 0 ? (
                <div className="divide-y divide-zinc-800/40">
                  {log.items.map(item => (
                    <div key={item.id} className="flex items-center px-4 py-3 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.food_name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {item.serving} · {item.kcal}kcal
                          {' · '}탄{item.carbs_g}g 단{item.protein_g}g 지{item.fat_g}g
                        </p>
                      </div>
                      <button
                        onClick={() => removeMealItem(log.id, item.id)}
                        className="text-zinc-600 hover:text-red-400 p-1 flex-shrink-0 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-4 flex items-center gap-2 text-zinc-600">
                  <UtensilsCrossed size={14} />
                  <p className="text-xs">아직 기록 없음</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}
