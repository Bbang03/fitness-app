'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import BottomNav from '@/components/BottomNav';
import { Plus, ChevronRight, Play, Trash2, Dumbbell } from 'lucide-react';

export default function RoutinesPage() {
  const router = useRouter();
  const { currentUser, routines, deleteRoutine } = useStore();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const user = currentUser();

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  if (!user) return null;

  const myRoutines = routines
    .filter((r) => r.user_id === user.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const confirmDelete = (id: string) => {
    if (deletingId === id) {
      deleteRoutine(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 2500);
    }
  };

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">루틴</h1>
        <Link
          href="/routines/new"
          className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition-colors"
        >
          <Plus size={20} />
        </Link>
      </div>

      {myRoutines.length === 0 ? (
        <div className="mx-4 mt-8 bg-zinc-900 rounded-2xl p-8 text-center">
          <Dumbbell size={40} className="text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-300 font-medium mb-1">루틴이 없습니다</p>
          <p className="text-zinc-500 text-sm mb-5">
            자신만의 운동 루틴을 만들어보세요
          </p>
          <Link
            href="/routines/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-5 py-3 rounded-xl"
          >
            <Plus size={18} />
            루틴 만들기
          </Link>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {myRoutines.map((routine) => (
            <div key={routine.id} className="bg-zinc-900 rounded-2xl overflow-hidden">
              <div className="px-4 py-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{routine.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {routine.items.length}가지 운동 ·{' '}
                    {routine.items.reduce((s, i) => s + i.target_sets, 0)}세트
                  </p>
                </div>
                <Link
                  href={`/routines/${routine.id}/workout`}
                  className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl transition-colors flex-shrink-0"
                >
                  <Play size={16} fill="white" />
                </Link>
              </div>

              {/* Exercise preview */}
              {routine.items.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {routine.items
                    .sort((a, b) => a.order - b.order)
                    .map((item) => (
                      <span
                        key={item.id}
                        className="bg-zinc-800 text-zinc-300 text-xs px-2.5 py-1 rounded-full"
                      >
                        {item.exercise_name}
                      </span>
                    ))}
                </div>
              )}

              {/* Actions */}
              <div className="border-t border-zinc-800 flex">
                <Link
                  href={`/routines/${routine.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  <ChevronRight size={14} />
                  편집
                </Link>
                <button
                  onClick={() => confirmDelete(routine.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs transition-colors border-l border-zinc-800 ${
                    deletingId === routine.id
                      ? 'text-red-400 bg-red-900/20'
                      : 'text-zinc-400 hover:text-red-400'
                  }`}
                >
                  <Trash2 size={14} />
                  {deletingId === routine.id ? '한 번 더 탭하면 삭제' : '삭제'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
