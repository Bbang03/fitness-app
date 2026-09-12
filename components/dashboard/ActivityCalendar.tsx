'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import {
  createEmptyCalendarDaySummary,
  type CalendarDaySummary,
  type CalendarNutritionGoals,
} from '@/lib/calendarSummary';

import SelectedDayDetail from './SelectedDayDetail';

interface ActivityCalendarProps {
  summaries: ReadonlyMap<string, CalendarDaySummary>;
  today: string;
  nutritionGoals: CalendarNutritionGoals;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDayCount(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDay(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function summaryStatusLabel(summary: CalendarDaySummary): string[] {
  const labels: string[] = [];

  if (summary.completedWorkoutCount > 0) {
    labels.push(`운동 ${summary.completedWorkoutCount}회`);
  }

  if (summary.nutritionStatus === 'below_target') {
    if (summary.deficitKeys.includes('kcal')) {
      labels.push('열량 목표 미달');
    }
    if (summary.deficitKeys.includes('protein')) {
      labels.push('단백질 목표 미달');
    }
  } else if (summary.nutritionStatus === 'goal_unavailable') {
    labels.push('영양 목표 기준 없음');
  } else if (summary.nutritionStatus === 'in_progress') {
    labels.push('오늘 진행 중');
  } else if (summary.nutritionStatus === 'met') {
    labels.push('영양 목표 달성');
  } else if (summary.nutritionStatus === 'unrecorded') {
    labels.push('식단 미기록');
  }

  return labels;
}

function monthTitle(year: number, month: number): string {
  return `${year}년 ${month + 1}월`;
}

export default function ActivityCalendar({
  summaries,
  today,
  nutritionGoals,
}: ActivityCalendarProps) {
  const todayDate = parseDateKey(today);
  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  const days = useMemo(() => {
    const leadingEmptyDays = getFirstDay(year, month);
    const dayCount = getDayCount(year, month);
    const totalCells = Math.ceil((leadingEmptyDays + dayCount) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const day = index - leadingEmptyDays + 1;
      return day >= 1 && day <= dayCount ? day : null;
    });
  }, [month, year]);

  const selectedSummary = selectedDate
    ? summaries.get(selectedDate) ?? createEmptyCalendarDaySummary(selectedDate, today)
    : null;

  const goToMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDate(null);
  };

  const goToToday = () => {
    setYear(todayDate.getFullYear());
    setMonth(todayDate.getMonth());
    setSelectedDate(today);
  };

  return (
    <section className="activity-calendar" aria-labelledby="activity-calendar-title">
      <div className="activity-calendar__heading">
        <div>
          <p className="activity-calendar__eyebrow">기록을 한눈에</p>
          <h2 id="activity-calendar-title">나의 활동 달력</h2>
        </div>
        <button type="button" className="activity-calendar__today" onClick={goToToday}>
          오늘
        </button>
      </div>

      <div className="activity-calendar__card">
        <div className="activity-calendar__monthbar">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            className="activity-calendar__nav"
            aria-label="이전 달 보기"
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <h3 aria-live="polite">{monthTitle(year, month)}</h3>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className="activity-calendar__nav"
            aria-label="다음 달 보기"
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="activity-calendar__weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday, index) => (
            <span key={weekday} data-weekend={index === 0 || index === 6}>{weekday}</span>
          ))}
        </div>

        <div className="activity-calendar__grid" role="grid" aria-label={`${monthTitle(year, month)} 활동 달력`}>
          {days.map((day, index) => {
            if (day === null) {
              return <span key={`empty-${index}`} className="activity-calendar__empty" aria-hidden="true" />;
            }

            const key = dateKey(year, month, day);
            const summary = summaries.get(key) ?? createEmptyCalendarDaySummary(key, today);
            const isFuture = key > today;
            const isToday = key === today;
            const isSelected = key === selectedDate;
            const labels = summaryStatusLabel(summary);
            const ariaLabel = `${year}년 ${month + 1}월 ${day}일${labels.length > 0 ? `, ${labels.join(', ')}` : ', 기록 없음'}`;

            return (
              <button
                type="button"
                key={key}
                role="gridcell"
                className="activity-calendar__day"
                data-today={isToday || undefined}
                data-selected={isSelected || undefined}
                data-future={isFuture || undefined}
                data-below-target={summary.nutritionStatus === 'below_target' || undefined}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                disabled={isFuture}
                aria-label={ariaLabel}
                aria-pressed={isSelected}
              >
                <span className="activity-calendar__day-number">{day}</span>
                <span className="activity-calendar__markers" aria-hidden="true">
                  {summary.completedWorkoutCount > 0 && <span className="activity-calendar__workout-marker" />}
                  {summary.nutritionStatus === 'below_target' && <span className="activity-calendar__nutrition-marker" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="activity-calendar__legend" aria-label="달력 범례">
          <span><i className="activity-calendar__workout-marker" aria-hidden="true" />운동 완료</span>
          <span><i className="activity-calendar__nutrition-marker" aria-hidden="true" />영양 목표 미달</span>
        </div>
      </div>

      {selectedSummary && (
        <SelectedDayDetail
          summary={selectedSummary}
          kcalGoal={nutritionGoals.kcal}
          proteinGoal={nutritionGoals.protein_g}
          onToggle={() => setSelectedDate(null)}
        />
      )}
    </section>
  );
}
