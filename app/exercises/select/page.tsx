'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  ChevronLeft, Search, Star, X, Plus,
} from 'lucide-react';
import {
  EXERCISE_DB, searchExercises, BODY_PARTS, EQUIPMENTS, RECORD_TYPE_LABEL,
  type BodyPart, type Equipment, type Exercise, type RecordType,
} from '@/lib/exerciseData';

// ── Custom exercise form ──────────────────────────────────────────────────

function CustomForm({ targetIndex, onDone }: { targetIndex: number; onDone: () => void }) {
  const { setPendingExercise } = useStore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [recordType, setRecordType] = useState<RecordType>('weight_reps');
  const [err, setErr] = useState('');

  const handleAdd = () => {
    if (!name.trim()) { setErr('운동 이름을 입력해주세요.'); return; }
    setPendingExercise({ name: name.trim(), record_type: recordType, targetIndex });
    router.back();
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">운동 이름</label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
          placeholder="예: 스미스 머신 힙 쓰러스트"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-2 block">기록 방식</label>
        <div className="grid grid-cols-3 gap-2">
          {(['weight_reps', 'reps_only', 'time'] as RecordType[]).map(rt => (
            <button
              key={rt}
              onClick={() => setRecordType(rt)}
              className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                recordType === rt
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-300'
              }`}
            >
              {RECORD_TYPE_LABEL[rt]}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
      <button
        onClick={handleAdd}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors"
      >
        추가
      </button>
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
      }`}
    >
      {label}
    </button>
  );
}

// ── Exercise row ──────────────────────────────────────────────────────────

const BODY_COLOR: Record<BodyPart, string> = {
  가슴: 'text-rose-400', 등: 'text-blue-400', 어깨: 'text-violet-400',
  삼두: 'text-amber-400', 이두: 'text-emerald-400', 하체: 'text-orange-400',
  복근: 'text-cyan-400', 유산소: 'text-pink-400',
};

function ExerciseRow({
  exercise, isFavorite, onSelect, onToggleFav,
}: {
  exercise: Exercise;
  isFavorite: boolean;
  onSelect: (ex: Exercise) => void;
  onToggleFav: (id: string) => void;
}) {
  return (
    <div className="flex items-center border-b border-zinc-800/50 last:border-0">
      <button
        onClick={() => onSelect(exercise)}
        className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/40 transition-colors min-w-0"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{exercise.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-medium ${BODY_COLOR[exercise.body_part]}`}>
              {exercise.body_part}
            </span>
            <span className="text-[10px] text-zinc-600">{exercise.equipment}</span>
            <span className="text-[10px] text-zinc-700">{RECORD_TYPE_LABEL[exercise.record_type]}</span>
          </div>
        </div>
        <Plus size={16} className="text-blue-400 flex-shrink-0" />
      </button>
      <button
        onClick={() => onToggleFav(exercise.id)}
        className="px-3 py-4 flex-shrink-0"
      >
        <Star
          size={16}
          className={isFavorite ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}
        />
      </button>
    </div>
  );
}

// ── Inner page (needs Suspense for useSearchParams) ───────────────────────

function SelectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { favoriteExerciseIds, toggleFavorite, setPendingExercise } = useStore();

  const targetIndex = Number(searchParams.get('idx') ?? '0');

  const [tab, setTab] = useState<'all' | 'favorites' | 'custom'>('all');
  const [query, setQuery] = useState('');
  const [bodyFilter, setBodyFilter] = useState<BodyPart | null>(null);
  const [equipFilter, setEquipFilter] = useState<Equipment | null>(null);

  const results = useMemo(() => {
    if (tab === 'favorites') {
      const favSet = new Set(favoriteExerciseIds);
      return EXERCISE_DB.filter(e => favSet.has(e.id) &&
        (!bodyFilter || e.body_part === bodyFilter) &&
        (!equipFilter || e.equipment === equipFilter) &&
        (!query || e.name.toLowerCase().includes(query.toLowerCase()))
      );
    }
    return searchExercises(query, bodyFilter, equipFilter);
  }, [query, bodyFilter, equipFilter, tab, favoriteExerciseIds]);

  const handleSelect = (exercise: Exercise) => {
    setPendingExercise({
      name: exercise.name,
      record_type: exercise.record_type,
      targetIndex,
    });
    router.back();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-zinc-950/95 backdrop-blur z-20 border-b border-zinc-800/50">
        <div className="px-4 pt-10 pb-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-white p-1 -ml-1">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold flex-1">운동 선택</h1>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1 pb-3">
          {(['all', 'favorites', 'custom'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400'
              }`}
            >
              {t === 'all' ? '전체' : t === 'favorites' ? '즐겨찾기' : '직접 입력'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'custom' ? (
        <CustomForm targetIndex={targetIndex} onDone={() => router.back()} />
      ) : (
        <>
          {/* Search + filters */}
          <div className="sticky top-[108px] bg-zinc-950/95 backdrop-blur z-10 px-4 pt-3 pb-2">
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                placeholder="운동 이름 검색..."
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Body part chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <Chip label="전체" active={!bodyFilter} onClick={() => setBodyFilter(null)} />
              {BODY_PARTS.map(bp => (
                <Chip key={bp} label={bp} active={bodyFilter === bp} onClick={() => setBodyFilter(bodyFilter === bp ? null : bp)} />
              ))}
            </div>

            {/* Equipment chips */}
            <div className="flex gap-1.5 overflow-x-auto pt-1.5 pb-1 no-scrollbar">
              <Chip label="전체" active={!equipFilter} onClick={() => setEquipFilter(null)} />
              {EQUIPMENTS.map(eq => (
                <Chip key={eq} label={eq} active={equipFilter === eq} onClick={() => setEquipFilter(equipFilter === eq ? null : eq)} />
              ))}
            </div>

            <p className="text-[10px] text-zinc-600 mt-1.5">
              {results.length}개 운동
            </p>
          </div>

          {/* Exercise list */}
          <div className="flex-1 bg-zinc-900 mx-4 mt-2 mb-6 rounded-2xl overflow-hidden">
            {results.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">
                운동을 찾을 수 없습니다.
                <button
                  onClick={() => setTab('custom')}
                  className="block mx-auto mt-2 text-blue-400 text-sm"
                >
                  직접 입력하기 →
                </button>
              </div>
            ) : (
              results.map(ex => (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  isFavorite={favoriteExerciseIds.includes(ex.id)}
                  onSelect={handleSelect}
                  onToggleFav={toggleFavorite}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SelectExercisePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">로딩 중...</div>}>
      <SelectInner />
    </Suspense>
  );
}
