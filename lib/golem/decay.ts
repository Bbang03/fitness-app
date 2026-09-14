import { differenceInCalendarDays } from 'date-fns';
import { inferRegion } from '../guardianProgress';
import type { WorkoutLog } from '../types';
import type { GolemCombination, GolemGrowthPart, GolemLevel } from './types';

export type GolemLastActivity = Record<GolemGrowthPart, Date | null>;

const GROWTH_PARTS = ['upper', 'lower', 'core'] as const;
const DECAY_AFTER_DAYS = 6;

/** Read only completed, non-future workouts using the same region rules as growth. */
export function getGolemLastActivity(
  logs: readonly WorkoutLog[],
  now: Date,
): GolemLastActivity {
  const latest: GolemLastActivity = { upper: null, lower: null, core: null };
  if (!Number.isFinite(now.getTime())) return latest;

  for (const log of logs) {
    if (!log.finished_at) continue;
    const completedAt = new Date(log.finished_at);
    if (!Number.isFinite(completedAt.getTime()) || completedAt > now) continue;

    for (const set of log.sets) {
      const region = inferRegion(set.exercise_name);
      if (!region || region === 'cardio') continue;
      const previous = latest[region];
      if (!previous || completedAt > previous) latest[region] = completedAt;
    }
  }
  return latest;
}

/**
 * Apply at most one visual step of inactivity, never changing cumulative growth.
 * Calendar days use the viewer's local timezone (5 days ago stays, 6 days decays).
 * The caller supplies one clock value; absent/invalid dates leave the base intact.
 */
export function applyGolemVisualDecay(
  base: GolemCombination,
  lastActivity: GolemLastActivity,
  now: Date,
): GolemCombination {
  const displayed = { ...base };
  for (const part of GROWTH_PARTS) {
    const last = lastActivity[part];
    if (last && differenceInCalendarDays(now, last) >= DECAY_AFTER_DAYS) {
      displayed[part] = Math.max(0, base[part] - 1) as GolemLevel;
    }
  }
  return displayed;
}
