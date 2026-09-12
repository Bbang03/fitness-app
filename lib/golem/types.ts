export const GOLEM_LEVELS = [0, 1, 2] as const;

export type GolemLevel = (typeof GOLEM_LEVELS)[number];

export type GolemGrowthPart = 'upper' | 'lower' | 'core';

export interface GolemCombination {
  upper: GolemLevel;
  lower: GolemLevel;
  core: GolemLevel;
}

export interface GolemAvatarProps extends GolemCombination {
  size?: number;
  className?: string;
  debug?: boolean;
}

export interface GolemAssetSources {
  head: string | null;
  upper: Record<GolemLevel, string | null>;
  lower: Record<GolemLevel, string | null>;
  core: Record<GolemLevel, string | null>;
}
