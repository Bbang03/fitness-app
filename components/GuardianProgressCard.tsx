/* Hallmark · component: guardian progress · genre: playful · theme: design.md · pre-emit critique: P5 H4 E4 S5 R5 V4 */
import GolemAvatar from '@/components/golem/GolemAvatar';
import { guardianLevelToGolemLevel } from '@/lib/golem/level';
import type { GuardianProgress } from '@/lib/guardianProgress';

const stageNames = ['잠든 돌', '새싹 돌', '단단한 돌', '쌓이는 돌', '수호석', '차곡 수호자'];

function RegionMeter({ label, points, level }: { label: string; points: number; level: number }) {
  return (
    <div className="guardian-meter">
      <div className="guardian-meter__label">
        <span>{label}</span>
        <strong>{points}세트</strong>
      </div>
      <progress max="5" value={level} aria-label={`${label} 성장 ${level}단계`} />
    </div>
  );
}

export default function GuardianProgressCard({ progress }: { progress: GuardianProgress }) {
  const maxLevel = progress.overallLevel >= 5;
  const golemLevels = {
    upper: guardianLevelToGolemLevel(progress.upperLevel),
    lower: guardianLevelToGolemLevel(progress.lowerLevel),
    core: guardianLevelToGolemLevel(progress.coreLevel),
  };

  return (
    <section className="guardian-card" aria-labelledby="guardian-title">
      <div className="guardian-card__copy">
        <div className="guardian-card__heading">
          <div>
            <p className="guardian-card__label">나의 돌 정령</p>
            <h2 id="guardian-title">{stageNames[progress.overallLevel]}</h2>
          </div>
          <span>{progress.overallLevel}단계</span>
        </div>

        <p className="guardian-card__message">{progress.message}</p>

        <div className="guardian-card__regions">
          <RegionMeter label="상체" points={progress.upperPoints} level={progress.upperLevel} />
          <RegionMeter label="하체" points={progress.lowerPoints} level={progress.lowerLevel} />
          <RegionMeter label="코어" points={progress.corePoints} level={progress.coreLevel} />
        </div>
      </div>

      <figure className="guardian-card__figure">
        <div className="guardian-golem-frame" aria-hidden="true">
          <GolemAvatar
            upper={golemLevels.upper}
            lower={golemLevels.lower}
            core={golemLevels.core}
            size={136}
          />
        </div>
        <figcaption>
          {progress.completedWorkouts === 0
            ? '운동 기록을 기다리는 중'
            : `완료한 운동 ${progress.completedWorkouts}회`}
        </figcaption>
      </figure>

      <div className="guardian-card__next">
        <div>
          <span>{maxLevel ? '최고 단계에 도달했어요' : `다음 성장까지 ${progress.pointsToNextLevel}세트`}</span>
          <small>완료한 운동 세트에서 자동 반영</small>
        </div>
        <progress max="100" value={progress.overallProgress} aria-label={`다음 성장까지 ${progress.overallProgress}%`} />
      </div>
    </section>
  );
}
