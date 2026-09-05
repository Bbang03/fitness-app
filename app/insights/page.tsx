'use client';

import {
  useEffect,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  Activity,
  BrainCircuit,
  Dumbbell,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

import AppShell from '@/components/AppShell';

import { useStore } from '@/lib/store';

export default function InsightsPage() {
  const router =
    useRouter();

  const {
    currentUser,
    workoutLogs,
    getInbodyRecords,
  } = useStore();

  const user =
    currentUser();

  useEffect(() => {
    if (!user) {
      router.replace(
        '/login',
      );
    }
  }, [
    user?.id,
    router,
  ]);

  if (!user) {
    return null;
  }

  const userWorkoutLogs =
    workoutLogs.filter(
      (
        log,
      ) =>
        log.user_id ===
        user.id,
    );

  const inbodyRecords =
    getInbodyRecords();

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
          FitTrack AI
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          인사이트
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          운동·식단·체성분 데이터를
          바탕으로 나의 변화를
          분석합니다.
        </p>
      </header>

      <main className="px-5">
        <section className="overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/15 via-zinc-900 to-zinc-950 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15">
            <BrainCircuit
              size={22}
              className="text-blue-400"
            />
          </div>

          <p className="mt-5 text-xs font-semibold text-blue-400">
            체성분 예측
          </p>

          <h2 className="mt-2 text-xl font-bold leading-snug">
            예측을 준비하고 있어요
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            충분한 기록이 쌓이면
            현재 운동량, 식단,
            체성분 변화와 가입 시
            입력한 생활 패턴을 함께
            분석해 미래 체성분 변화를
            보여줄 예정입니다.
          </p>
        </section>

        <section className="mt-7">
          <h2 className="text-sm font-semibold text-zinc-200">
            현재 수집된 데이터
          </h2>

          <div className="mt-3 space-y-2">
            <DataRow
              icon={
                Dumbbell
              }
              label="운동 기록"
              value={`${userWorkoutLogs.length}회`}
              className="text-blue-400"
            />

            <DataRow
              icon={
                UtensilsCrossed
              }
              label="식단 기록"
              value="연동 준비 중"
              className="text-emerald-400"
            />

            <DataRow
              icon={
                Activity
              }
              label="인바디 기록"
              value={`${inbodyRecords.length}회`}
              className="text-violet-400"
            />
          </div>
        </section>

        <section className="mt-7 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center gap-2">
            <Sparkles
              size={17}
              className="text-amber-400"
            />

            <p className="text-sm font-semibold">
              앞으로 제공할 분석
            </p>
          </div>

          <div className="mt-4 space-y-3 text-sm text-zinc-400">
            <p>
              • 미래 체중 및 체지방률
              변화 범위
            </p>

            <p>
              • 골격근량 변화 가능성
            </p>

            <p>
              • 최근 운동·영양 패턴이
              예측에 미친 영향
            </p>

            <p>
              • 예측 불확실성과
              신뢰 가능한 데이터 범위
            </p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;

  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-4">
      <div className="flex items-center gap-3">
        <Icon
          size={18}
          className={
            className
          }
        />

        <span className="text-sm text-zinc-300">
          {label}
        </span>
      </div>

      <span className="text-xs font-medium text-zinc-500">
        {value}
      </span>
    </div>
  );
}