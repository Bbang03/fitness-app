import Link from 'next/link';

import {
  ArrowUpRight,
  Dumbbell,
  UtensilsCrossed,
} from 'lucide-react';

import type {
  CalendarDaySummary,
} from '@/lib/calendarSummary';

import {
  calcTotalVolume,
} from '@/lib/utils';

interface SelectedDayDetailProps {
  summary: CalendarDaySummary;
  kcalGoal: number | null;
  proteinGoal: number | null;
  onToggle: () => void;
}

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function formatDuration(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) {
    return null;
  }

  const seconds = Math.max(
    0,
    Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );

  if (seconds < 60) {
    return '1분 미만';
  }

  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
  }

  return `${minutes}분`;
}

function exerciseSetLabels(workout: CalendarDaySummary['workouts'][number]) {
  const counts = new Map<string, number>();

  for (const set of workout.sets) {
    const name = set.exercise_name.trim();
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([name, count]) => `${name} ${count}세트`);
}

function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString('ko-KR', {
    maximumFractionDigits: fractionDigits,
  });
}

function goalDeficitLabel(
  summary: CalendarDaySummary,
  kcalGoal: number | null,
  proteinGoal: number | null,
): string | null {
  const deficits: string[] = [];

  if (summary.deficitKeys.includes('kcal') && kcalGoal !== null) {
    deficits.push(`열량 목표까지 ${formatNumber(Math.max(0, kcalGoal - summary.nutrition.kcal))}kcal`);
  }

  if (summary.deficitKeys.includes('protein') && proteinGoal !== null) {
    deficits.push(`단백질 목표까지 ${formatNumber(Math.max(0, proteinGoal - summary.nutrition.protein_g))}g`);
  }

  return deficits.length > 0 ? deficits.join(' · ') : null;
}

export default function SelectedDayDetail({
  summary,
  kcalGoal,
  proteinGoal,
  onToggle,
}: SelectedDayDetailProps) {
  const deficitLabel = goalDeficitLabel(summary, kcalGoal, proteinGoal);

  return (
    <article className="calendar-day-detail" aria-labelledby="calendar-day-detail-title">
      <button
        type="button"
        className="calendar-day-detail__header"
        onClick={onToggle}
        aria-expanded="true"
      >
        <span>
          <strong id="calendar-day-detail-title">{formatDateLabel(summary.date)}</strong>
          <span className="calendar-day-detail__summary">
            운동 {summary.completedWorkoutCount}회 · 식사 {summary.mealCount}끼
          </span>
        </span>
        <span className="calendar-day-detail__collapse" aria-hidden="true">접기</span>
      </button>

      <div className="calendar-day-detail__body">
        <section className="calendar-day-detail__section" aria-labelledby="calendar-workout-heading">
          <div className="calendar-day-detail__section-heading">
            <div className="calendar-day-detail__section-title">
              <Dumbbell size={17} aria-hidden="true" />
              <h3 id="calendar-workout-heading">운동</h3>
            </div>
            {summary.completedWorkoutCount > 0 && (
              <Link href={`/history?date=${summary.date}`} className="calendar-inline-link">
                운동 기록 자세히 <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>

          {summary.workouts.length > 0 ? (
            <div className="calendar-workout-list">
              {summary.workouts.map((workout) => {
                const volume = calcTotalVolume(workout.sets);
                const duration = formatDuration(workout.started_at, workout.finished_at);
                const exercises = exerciseSetLabels(workout);

                return (
                  <div key={workout.id} className="calendar-workout-row">
                    <div className="calendar-workout-row__main">
                      <strong>{workout.routine_name || '운동 기록'}</strong>
                      <span>{exercises.length > 0 ? exercises.join(' · ') : '종목 정보 없음'}</span>
                    </div>
                    <div className="calendar-workout-row__meta">
                      <span>{workout.sets.length}세트</span>
                      {duration && <span>{duration}</span>}
                      {volume > 0 && <span>{formatNumber(volume)}kg</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="calendar-empty-state">
              <p>이 날 완료한 운동 기록이 없어요.</p>
              <Link href="/routines" className="calendar-inline-link">운동 기록하기 <ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
          )}
        </section>

        <section className="calendar-day-detail__section" aria-labelledby="calendar-nutrition-heading">
          <div className="calendar-day-detail__section-heading">
            <div className="calendar-day-detail__section-title">
              <UtensilsCrossed size={17} aria-hidden="true" />
              <h3 id="calendar-nutrition-heading">영양</h3>
            </div>
            <Link href={`/meals?date=${summary.date}`} className="calendar-inline-link">
              식단 자세히 <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {summary.mealCount === 0 ? (
            <div className="calendar-empty-state">
              <p>이 날은 식단 기록이 없어요.</p>
              <Link href={`/meals?date=${summary.date}`} className="calendar-inline-link">식단 기록하기 <ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
          ) : (
            <>
              <div className="calendar-nutrition-grid">
                <NutritionValue
                  label="열량"
                  value={summary.nutrition.kcal}
                  goal={kcalGoal}
                  unit="kcal"
                  isDeficit={summary.deficitKeys.includes('kcal')}
                />
                <NutritionValue
                  label="단백질"
                  value={summary.nutrition.protein_g}
                  goal={proteinGoal}
                  unit="g"
                  isDeficit={summary.deficitKeys.includes('protein')}
                />
              </div>

              {summary.nutritionStatus === 'in_progress' && (
                <p className="calendar-day-detail__note">오늘 기록은 하루가 끝난 뒤 목표 상태를 보여드려요.</p>
              )}
              {summary.nutritionStatus === 'goal_unavailable' && (
                <p className="calendar-day-detail__note">
                  인바디를 기록하면 개인 기준을 확인할 수 있어요.{' '}
                  <Link href="/inbody/new" className="calendar-inline-link">인바디 기록하기 <ArrowUpRight size={14} aria-hidden="true" /></Link>
                </p>
              )}
              {summary.nutritionStatus === 'below_target' && deficitLabel && (
                <p className="calendar-day-detail__deficit">{deficitLabel}</p>
              )}
              {summary.nutritionStatus === 'met' && (
                <p className="calendar-day-detail__note calendar-day-detail__note--positive">계산 가능한 영양 목표를 채웠어요.</p>
              )}
            </>
          )}
        </section>
      </div>
    </article>
  );
}

function NutritionValue({
  label,
  value,
  goal,
  unit,
  isDeficit,
}: {
  label: string;
  value: number;
  goal: number | null;
  unit: string;
  isDeficit: boolean;
}) {
  return (
    <div className={`calendar-nutrition-value${isDeficit ? ' is-deficit' : ''}`}>
      <span>{label}</span>
      <strong>
        {formatNumber(value)}{unit}
        {goal !== null && <em> / {formatNumber(goal)}{unit}</em>}
      </strong>
    </div>
  );
}
