'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import BottomNav from '@/components/BottomNav';
import { ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import { formatDuration, calcTotalVolume, isoToDateKey } from '@/lib/utils';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function HistoryPage() {
  const router = useRouter();
  const { currentUser, workoutLogs } = useStore();
  const user = currentUser();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  if (!user) return null;

  const myLogs = workoutLogs.filter((l) => l.user_id === user.id);
  const logsByDate = myLogs.reduce<Record<string, typeof myLogs>>((acc, log) => {
    const key = isoToDateKey(log.started_at);
    (acc[key] = acc[key] || []).push(log);
    return acc;
  }, {});

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  const selectedLogs = selectedDate ? (logsByDate[selectedDate] || []) : [];

  return (
    <div className="pb-24">
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-xl font-bold">운동 기록</h1>
      </div>

      {/* Calendar */}
      <div className="mx-4 bg-zinc-900 rounded-2xl overflow-hidden mb-4">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <button onClick={prevMonth} className="text-zinc-400 hover:text-white p-1">
            <ChevronLeft size={20} />
          </button>
          <p className="font-semibold">
            {year}년 {MONTHS[month]}
          </p>
          <button onClick={nextMonth} className="text-zinc-400 hover:text-white p-1">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day names */}
        <div className="grid grid-cols-7 px-2 pt-2">
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs py-1 font-medium ${
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-zinc-500'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 px-2 pb-3">
          {/* Empty cells for first week */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasWorkout = !!logsByDate[dateKey];
            const isToday = dateKey === isoToDateKey(today.toISOString());
            const isSelected = selectedDate === dateKey;
            const dayOfWeek = (firstDay + i) % 7;

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-full mx-0.5 my-0.5 transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isToday
                    ? 'bg-zinc-700 text-white'
                    : 'hover:bg-zinc-800'
                }`}
              >
                <span
                  className={`text-sm ${
                    !isSelected && (dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-blue-400' : 'text-zinc-200')
                  }`}
                >
                  {day}
                </span>
                {hasWorkout && (
                  <span
                    className={`absolute bottom-1 w-1 h-1 rounded-full ${
                      isSelected ? 'bg-white' : 'bg-blue-400'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day logs */}
      {selectedDate && (
        <div className="px-4 mb-4">
          <p className="text-sm text-zinc-400 mb-3">
            {(() => {
                const [y, m, d] = selectedDate.split('-');
                return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
              })()}
          </p>
          {selectedLogs.length === 0 ? (
            <div className="bg-zinc-900 rounded-2xl p-5 text-center text-zinc-500 text-sm">
              이 날은 운동하지 않았습니다
            </div>
          ) : (
            <div className="space-y-3">
              {selectedLogs.map((log) => {
                const durationMin = log.finished_at
                  ? Math.round(
                      (new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) /
                        60000,
                    )
                  : null;
                const volume = calcTotalVolume(log.sets);

                const exerciseGroups = log.sets.reduce<Record<string, typeof log.sets>>(
                  (acc, s) => {
                    (acc[s.exercise_name] = acc[s.exercise_name] || []).push(s);
                    return acc;
                  },
                  {},
                );

                return (
                  <div key={log.id} className="bg-zinc-900 rounded-2xl overflow-hidden">
                    <div className="px-4 pt-4 pb-3 border-b border-zinc-800">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{log.routine_name}</p>
                        <div className="flex gap-3 text-xs text-zinc-400">
                          {durationMin != null && durationMin > 0 && <span>{durationMin}분</span>}
                          {volume > 0 && <span>{volume.toLocaleString()}kg</span>}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{log.sets.length}세트 완료</p>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {Object.entries(exerciseGroups).map(([name, sets]) => (
                        <div key={name}>
                          <p className="text-xs text-zinc-400 mb-1">{name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {sets.map((s) => (
                              <span
                                key={s.id}
                                className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md"
                              >
                                {s.weight_kg}kg × {s.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recent logs (if no date selected) */}
      {!selectedDate && (
        <div className="px-4">
          <p className="text-sm font-medium text-zinc-300 mb-3">전체 기록</p>
          {myLogs.length === 0 ? (
            <div className="bg-zinc-900 rounded-2xl p-8 text-center">
              <Dumbbell size={36} className="text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">아직 운동 기록이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myLogs.slice(0, 20).map((log) => {
                const durationSec = log.finished_at
                  ? Math.round(
                      (new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000,
                    )
                  : null;
                const volume = calcTotalVolume(log.sets);
                return (
                  <div key={log.id} className="bg-zinc-900 rounded-2xl px-4 py-3.5">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{log.routine_name}</p>
                      <p className="text-xs text-zinc-500">
                        {isoToDateKey(log.started_at).replace(/-/g, '.')}
                      </p>
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-zinc-400">{log.sets.length}세트</span>
                      {volume > 0 && <span className="text-xs text-zinc-400">{volume.toLocaleString()}kg 볼륨</span>}
                      {durationSec && <span className="text-xs text-zinc-400">{formatDuration(durationSec)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
