import Image from 'next/image';
import type { GuardianProgress } from '@/lib/guardianProgress';

type GuardianVisual = 'balanced' | 'upper' | 'lower' | 'core';

function visualFor(progress: GuardianProgress): GuardianVisual {
  if (progress.balance === 'sleeping') return 'balanced';

  if (
    progress.coreLevel > progress.upperLevel &&
    progress.coreLevel > progress.lowerLevel
  ) {
    return 'core';
  }

  if (progress.balance === 'upper_dominant') return 'upper';
  if (progress.balance === 'lower_dominant') return 'lower';

  if (progress.upperLevel > progress.lowerLevel) return 'upper';
  if (progress.lowerLevel > progress.upperLevel) return 'lower';

  return 'balanced';
}

export default function StoneGuardian({ progress }: { progress: GuardianProgress }) {
  const visual = visualFor(progress);
  const visualLevel =
    visual === 'upper'
      ? progress.upperLevel
      : visual === 'lower'
        ? progress.lowerLevel
        : visual === 'core'
          ? progress.coreLevel
          : progress.overallLevel;
  const level = Math.min(5, Math.max(0, Math.round(visualLevel)));
  const description =
    progress.balance === 'sleeping'
      ? '새싹이 돋은 아기 돌 정령이 잠에서 깨기를 기다리고 있어요.'
      : `${visual === 'upper' ? '상체' : visual === 'lower' ? '하체' : visual === 'core' ? '코어' : '균형'} 중심으로 ${level}단계까지 성장한 차곡 돌 정령`;

  return (
    <Image
      className="stone-guardian"
      src={`/guardian/stages/${visual}-${level}.png`}
      width={level === 5 ? 170 : 138}
      height={200}
      sizes="(max-width: 374px) 108px, 136px"
      alt={description}
      data-stage={level}
      data-balance={visual}
      priority
    />
  );
}
