import type {
  MealLog,
} from './types';


export interface NutritionStreakResult {
  days: number;
  todayRecorded: boolean;
}


function shiftDateKey(
  dateKey: string,
  offsetDays: number,
): string | null {
  const [
    year,
    month,
    day,
  ] = dateKey
    .split('-')
    .map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  date.setUTCDate(
    date.getUTCDate() +
      offsetDays,
  );

  const shiftedYear =
    date.getUTCFullYear();

  const shiftedMonth =
    String(
      date.getUTCMonth() + 1,
    ).padStart(
      2,
      '0',
    );

  const shiftedDay =
    String(
      date.getUTCDate(),
    ).padStart(
      2,
      '0',
    );

  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}


export function calculateNutritionStreak(
  mealLogs: readonly MealLog[],
  today: string,
): NutritionStreakResult {
  const recordedDates =
    new Set(
      mealLogs
        .filter(
          (
            log,
          ) =>
            log.items.length >
            0,
        )
        .map(
          (
            log,
          ) =>
            log.date,
        ),
    );

  const todayRecorded =
    recordedDates.has(
      today,
    );

  let cursor =
    todayRecorded
      ? today
      : shiftDateKey(
          today,
          -1,
        );

  if (
    !cursor ||
    !recordedDates.has(
      cursor,
    )
  ) {
    return {
      days: 0,
      todayRecorded,
    };
  }

  let days = 0;

  while (
    cursor &&
    recordedDates.has(
      cursor,
    )
  ) {
    days += 1;

    cursor =
      shiftDateKey(
        cursor,
        -1,
      );
  }

  return {
    days,
    todayRecorded,
  };
}
