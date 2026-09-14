import {
  GOLEM_LEVELS,
} from '@/lib/golem/types';

import type {
  GolemAssetSources,
  GolemCombination,
  GolemGrowthPart,
  GolemLevel,
} from '@/lib/golem/types';

export const GOLEM_LEVEL_LABELS: Record<GolemLevel, string> = {
  0: 'Lv0',
  1: 'Lv1',
  2: 'Lv2',
  3: 'Lv3',
  4: 'Lv4',
};

export const GOLEM_PART_LABELS: Record<GolemGrowthPart, string> = {
  upper: '상체',
  lower: '하체',
  core: '코어',
};

export function guardianLevelToGolemLevel(level: number): GolemLevel {
  const normalizedLevel = Number.isFinite(level)
    ? Math.min(5, Math.max(0, Math.trunc(level)))
    : 0;

  // Input is the Guardian regional level (not a raw set count).
  // Guardian 0/1/2/3/4–5 → base visual Lv0/Lv1/Lv2/Lv3/Lv4.
  return GOLEM_LEVELS[Math.min(normalizedLevel, 4)];
}

/**
 * Upper, lower and Core use dedicated Lv0–Lv4 full-canvas assets.
 * A null source uses the CSS placeholder.
 */
export const GOLEM_ASSET_SOURCES: GolemAssetSources = {
  head: '/golem/head/base.png',
  upper: {
    0: '/golem/upper/lv0.png',
    1: '/golem/upper/lv1.png',
    2: '/golem/upper/lv2.png',
    3: '/golem/upper/lv3.png',
    4: '/golem/upper/lv4.png',
  },
  lower: {
    0: '/golem/lower/lv0.png',
    1: '/golem/lower/lv1.png',
    2: '/golem/lower/lv2.png',
    3: '/golem/lower/lv3.png',
    4: '/golem/lower/lv4.png',
  },
  core: {
    0: '/golem/core/lv0.png',
    1: '/golem/core/lv1.png',
    2: '/golem/core/lv2.png',
    3: '/golem/core/lv3.png',
    4: '/golem/core/lv4.png',
  },
};

export const GOLEM_COMBINATIONS: readonly GolemCombination[] =
  GOLEM_LEVELS.flatMap((upper) =>
    GOLEM_LEVELS.flatMap((lower) =>
      GOLEM_LEVELS.map((core) => ({
        upper,
        lower,
        core,
      })),
    ),
  );

export function getGolemCombinationKey({
  upper,
  lower,
  core,
}: GolemCombination) {
  return `upper-${upper}_lower-${lower}_core-${core}`;
}
