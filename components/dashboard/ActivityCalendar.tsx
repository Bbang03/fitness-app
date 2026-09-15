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

interface ActivityCalendarProps {
  summaries: ReadonlyMap<
    string,
    CalendarDaySummary
  >;
  today: string;

  /*
   * 기존 Dashboard API 호환성을 위해
   * 일단 유지한다.
   *
   * 상세 패널을 제거했기 때문에
   * 현재 달력 UI에서는 직접 사용하지 않는다.
   */
  nutritionGoals: CalendarNutritionGoals;
}

const WEEKDAYS = [
  '일',
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
];

function parseDateKey(
  dateKey: string,
): Date {
  const [
    year,
    month,
    day,
  ] = dateKey
    .split('-')
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
  );
}

function dateKey(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${String(
    month + 1,
  ).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`;
}

function getDayCount(
  year: number,
  month: number,
): number {
  return new Date(
    year,
    month + 1,
    0,
  ).getDate();
}

function getFirstDay(
  year: number,
  month: number,
): number {
  return new Date(
    year,
    month,
    1,
  ).getDay();
}

function summaryStatusLabel(
  summary: CalendarDaySummary,
): string[] {
  const labels: string[] = [];

  if (
    summary.completedWorkoutCount >
    0
  ) {
    labels.push(
      `운동 ${summary.completedWorkoutCount}회`,
    );
  }

  if (
    summary.nutritionStatus ===
    'below_target'
  ) {
    if (
      summary.deficitKeys.includes(
        'kcal',
      )
    ) {
      labels.push(
        '열량 목표 미달',
      );
    }

    if (
      summary.deficitKeys.includes(
        'protein',
      )
    ) {
      labels.push(
        '단백질 목표 미달',
      );
    }
  } else if (
    summary.nutritionStatus ===
    'goal_unavailable'
  ) {
    labels.push(
      '영양 목표 기준 없음',
    );
  } else if (
    summary.nutritionStatus ===
    'in_progress'
  ) {
    labels.push(
      '오늘 진행 중',
    );
  } else if (
    summary.nutritionStatus === 'met'
  ) {
    labels.push(
      '영양 목표 달성',
    );
  } else if (
    summary.nutritionStatus ===
    'unrecorded'
  ) {
    labels.push(
      '식단 미기록',
    );
  }

  return labels;
}

function monthTitle(
  year: number,
  month: number,
): string {
  return `${year}년 ${month + 1}월`;
}

export default function ActivityCalendar({
  summaries,
  today,
}: ActivityCalendarProps) {
  const todayDate =
    parseDateKey(today);

  const [
    year,
    setYear,
  ] = useState(
    todayDate.getFullYear(),
  );

  const [
    month,
    setMonth,
  ] = useState(
    todayDate.getMonth(),
  );

  const days = useMemo(() => {
    const leadingEmptyDays =
      getFirstDay(
        year,
        month,
      );

    const dayCount =
      getDayCount(
        year,
        month,
      );

    const totalCells =
      Math.ceil(
        (
          leadingEmptyDays +
          dayCount
        ) / 7,
      ) * 7;

    return Array.from(
      {
        length: totalCells,
      },
      (_, index) => {
        const day =
          index -
          leadingEmptyDays +
          1;

        return (
          day >= 1 &&
          day <= dayCount
        )
          ? day
          : null;
      },
    );
  }, [
    month,
    year,
  ]);

  const goToMonth = (
    offset: number,
  ) => {
    const next =
      new Date(
        year,
        month + offset,
        1,
      );

    setYear(
      next.getFullYear(),
    );

    setMonth(
      next.getMonth(),
    );
  };

  return (
    <section
      className="activity-calendar"
      aria-label="활동 달력"
    >
      <div className="activity-calendar__card">
        <div className="activity-calendar__monthbar">
          <button
            type="button"
            onClick={() =>
              goToMonth(-1)
            }
            className="activity-calendar__nav"
            aria-label="이전 달 보기"
          >
            <ChevronLeft
              size={19}
              aria-hidden="true"
            />
          </button>

          <h3 aria-live="polite">
            {monthTitle(
              year,
              month,
            )}
          </h3>

          <button
            type="button"
            onClick={() =>
              goToMonth(1)
            }
            className="activity-calendar__nav"
            aria-label="다음 달 보기"
          >
            <ChevronRight
              size={19}
              aria-hidden="true"
            />
          </button>
        </div>

        <div
          className="activity-calendar__weekdays"
          aria-hidden="true"
        >
          {WEEKDAYS.map(
            (
              weekday,
              index,
            ) => (
              <span
                key={weekday}
                data-weekend={
                  index === 0 ||
                  index === 6
                }
              >
                {weekday}
              </span>
            ),
          )}
        </div>

        <div
          className="activity-calendar__grid"
          role="grid"
          aria-label={`${monthTitle(
            year,
            month,
          )} 활동 달력`}
        >
          {days.map(
            (
              day,
              index,
            ) => {
              if (
                day === null
              ) {
                return (
                  <span
                    key={`empty-${index}`}
                    className="activity-calendar__empty"
                    aria-hidden="true"
                  />
                );
              }

              const key =
                dateKey(
                  year,
                  month,
                  day,
                );

              const summary =
                summaries.get(key) ??
                createEmptyCalendarDaySummary(
                  key,
                  today,
                );

              const isFuture =
                key > today;

              const isToday =
                key === today;

              const labels =
                summaryStatusLabel(
                  summary,
                );

              const ariaLabel =
                `${year}년 ${
                  month + 1
                }월 ${day}일${
                  labels.length > 0
                    ? `, ${labels.join(
                        ', ',
                      )}`
                    : ', 기록 없음'
                }`;

              return (
                <div
                  key={key}
                  role="gridcell"
                  className="activity-calendar__day"
                  data-today={
                    isToday ||
                    undefined
                  }
                  data-future={
                    isFuture ||
                    undefined
                  }
                  data-below-target={
                    summary.nutritionStatus ===
                      'below_target' ||
                    undefined
                  }
                  aria-label={
                    ariaLabel
                  }
                >
                  <span className="activity-calendar__day-number">
                    {day}
                  </span>

                  <span
                    className="activity-calendar__markers"
                    aria-hidden="true"
                  >
                    {summary.completedWorkoutCount >
                      0 && (
                      <span className="activity-calendar__workout-marker" />
                    )}

                    {summary.nutritionStatus ===
                      'below_target' && (
                      <span className="activity-calendar__nutrition-marker" />
                    )}
                  </span>
                </div>
              );
            },
          )}
        </div>

        <div
          className="activity-calendar__legend"
          aria-label="달력 범례"
        >
          <span>
            <i
              className="activity-calendar__workout-marker"
              aria-hidden="true"
            />
            운동 완료
          </span>

          <span>
            <i
              className="activity-calendar__nutrition-marker"
              aria-hidden="true"
            />
            영양 목표 미달
          </span>
        </div>
      </div>
    </section>
  );
}