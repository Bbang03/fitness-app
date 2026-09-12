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
};

export const GOLEM_PART_LABELS: Record<GolemGrowthPart, string> = {
  upper: '상체',
  lower: '하체',
  core: '코어',
};

/**
 * 실제 파츠를 연결할 때 null을 `/golem/{part}/...png` 또는 `.svg` 경로로
 * 교체하면 GolemAvatar가 placeholder 대신 해당 이미지를 렌더링합니다.
 */
export const GOLEM_ASSET_SOURCES: GolemAssetSources = {
  head: '/golem/head/base.png',
  upper: {
    0: '/golem/upper/lv0.png',
    1: '/golem/upper/lv1.png',
    2: '/golem/upper/lv2.png',
  },
  lower: {
    0: '/golem/lower/lv0.png',
    1: '/golem/lower/lv1.png',
    2: '/golem/lower/lv2.png',
  },
  core: {
    0: '/golem/core/lv0.png',
    1: '/golem/core/lv1.png',
    2: '/golem/core/lv2.png',
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
