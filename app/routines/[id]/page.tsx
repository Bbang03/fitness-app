'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { ChevronLeft, Plus, BookOpen, X } from 'lucide-react';
import type { RoutineItem, RecordType } from '@/lib/types';

type DraftItem = Omit<RoutineItem, 'id'>;

function repsLabel(rt: RecordType) {
  return rt === 'time' ? '목표(초)' : '목표 횟수';
}

function Stepper({ value, onDec, onInc }: { value: number; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onDec}
        className="w-8 h-8 bg-zinc-800 rounded-lg text-zinc-300 hover:bg-zinc-700 flex items-center justify-center text-lg leading-none">−</button>
      <span className="flex-1 text-center text-sm font-semibold">{value}</span>
      <button type="button" onClick={onInc}
        className="w-8 h-8 bg-zinc-800 rounded-lg text-zinc-300 hover:bg-zinc-700 flex items-center justify-center text-lg leading-none">+</button>
    </div>
  );
}

export default function EditRoutinePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { currentUser, routines, updateRoutine, pendingExercise, setPendingExercise } = useStore();
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const user = currentUser();

  useEffect(() => {
    if (!user) { router.replace('/login'); return; }
    const routine = routines.find((r) => r.id === id);
    if (!routine) { router.replace('/routines'); return; }
    if (routine.user_id !== user.id) { router.replace('/routines'); return; }
    setName(routine.name);
    setItems([...routine.items].sort((a, b) => a.order - b.order).map(item => ({
      ...item,
      record_type: item.record_type ?? 'weight_reps',
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  // Consume pending exercise from library picker
  useEffect(() => {
    if (!pendingExercise) return;
    const { name: exName, record_type, targetIndex } = pendingExercise;
    setItems(prev => {
      const next = [...prev];
      if (targetIndex < next.length) {
        next[targetIndex] = { ...next[targetIndex], exercise_name: exName, record_type };
      }
      return next;
    });
    setPendingExercise(null);
  }, [pendingExercise, setPendingExercise]);

  const addItem = () => {
    setItems(prev => [...prev, {
      order: prev.length, exercise_name: '', target_sets: 3, target_reps: 10,
      rest_seconds: 90, record_type: 'weight_reps',
    }]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, order: i })));
  };

  const update = (idx: number, field: keyof DraftItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const handleSave = () => {
    if (!name.trim()) { setError('루틴 이름을 입력해주세요.'); return; }
    if (items.some(i => !i.exercise_name.trim())) { setError('모든 운동 이름을 입력해주세요.'); return; }
    updateRoutine(id, name.trim(), items);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    setError('');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 bg-zinc-950/95 backdrop-blur z-10 px-4 pt-12 pb-3 flex items-center gap-3 border-b border-zinc-800/50">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white p-1 -ml-1">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold flex-1">루틴 편집</h1>
        <button onClick={handleSave}
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
            saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}>
          {saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>

      <div className="px-4 pt-4 space-y-6">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">루틴 이름</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">운동 목록</label>
            <span className="text-xs text-zinc-500">{items.length}가지</span>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="bg-zinc-900 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    {item.exercise_name ? (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium flex-1 truncate">{item.exercise_name}</p>
                        <span className="text-[10px] text-zinc-500 flex-shrink-0">
                          {item.record_type === 'weight_reps' ? '무게+횟수' : item.record_type === 'reps_only' ? '횟수' : '시간'}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-600 italic">운동을 선택하세요</p>
                    )}
                  </div>
                  <Link
                    href={`/exercises/select?idx=${idx}`}
                    className="flex-shrink-0 flex items-center gap-1 text-blue-400 bg-blue-900/20 border border-blue-800/40 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  >
                    <BookOpen size={12} />
                    선택
                  </Link>
                  <button type="button" onClick={() => removeItem(idx)}
                    className="flex-shrink-0 text-zinc-600 hover:text-red-400 p-1 transition-colors"
                    disabled={items.length === 1}>
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1 text-center">세트</p>
                    <Stepper value={item.target_sets}
                      onDec={() => update(idx, 'target_sets', Math.max(1, item.target_sets - 1))}
                      onInc={() => update(idx, 'target_sets', item.target_sets + 1)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1 text-center">{repsLabel(item.record_type)}</p>
                    <Stepper value={item.target_reps}
                      onDec={() => update(idx, 'target_reps', Math.max(1, item.target_reps - (item.record_type === 'time' ? 15 : 1)))}
                      onInc={() => update(idx, 'target_reps', item.target_reps + (item.record_type === 'time' ? 15 : 1))} />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1 text-center">휴식(초)</p>
                    <Stepper value={item.rest_seconds}
                      onDec={() => update(idx, 'rest_seconds', Math.max(0, item.rest_seconds - 30))}
                      onInc={() => update(idx, 'rest_seconds', item.rest_seconds + 30)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={addItem}
            className="w-full mt-3 border-2 border-dashed border-zinc-700 hover:border-blue-500/50 text-zinc-400 hover:text-blue-400 rounded-2xl py-4 flex items-center justify-center gap-2 text-sm transition-colors">
            <Plus size={18} />
            운동 추가
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 rounded-xl py-2 px-3 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
