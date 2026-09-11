/* Hallmark · craft: tier-B hand-built SVG · state: workout-derived · motion: none */
import type { GuardianProgress } from '@/lib/guardianProgress';

export default function StoneGuardian({ progress }: { progress: GuardianProgress }) {
  const upper = progress.upperLevel;
  const lower = progress.lowerLevel;
  const core = progress.coreLevel;
  const torsoWidth = 72 + upper * 10;
  const torsoHeight = 64 + upper * 5;
  const torsoX = 110 - torsoWidth / 2;
  const torsoY = 165 - torsoHeight;
  const armWidth = 24 + upper * 6;
  const armHeight = 38 + upper * 5;
  const legWidth = 27 + lower * 4;
  const legHeight = 31 + lower * 5;
  const stance = 7 + lower * 3;
  const leftLegX = 110 - stance / 2 - legWidth;
  const rightLegX = 110 + stance / 2;
  const legY = 198 - legHeight;
  const coreRadius = 7 + core * 2.4;
  const isSleeping = progress.balance === 'sleeping';

  const description = isSleeping
    ? '아직 잠든 작은 돌 정령'
    : `상체 ${progress.upperLevel}단계, 하체 ${progress.lowerLevel}단계, 코어 ${progress.coreLevel}단계로 성장한 돌 정령`;

  return (
    <svg className="stone-guardian" viewBox="0 0 220 220" role="img" aria-label={description} data-stage={progress.overallLevel}>
      <ellipse className="stone-guardian__shadow" cx="110" cy="204" rx={45 + lower * 5} ry="8" />

      <g className="stone-guardian__legs">
        <rect className="stone-guardian__stone stone-guardian__stone--dark" x={leftLegX} y={legY} width={legWidth} height={legHeight} rx={10 + lower} />
        <rect className="stone-guardian__stone stone-guardian__stone--dark" x={rightLegX} y={legY} width={legWidth} height={legHeight} rx={10 + lower} />
        <path className="stone-guardian__crack" d={`M${leftLegX + legWidth * .42} ${legY + 8}l7 8-5 9 6 7`} />
        <path className="stone-guardian__crack" d={`M${rightLegX + legWidth * .58} ${legY + 8}l-7 8 5 9-6 7`} />
        {lower >= 3 && <>
          <rect className="stone-guardian__stone stone-guardian__foot" x={leftLegX - 6} y="188" width={legWidth + 9} height="13" rx="6" />
          <rect className="stone-guardian__stone stone-guardian__foot" x={rightLegX - 3} y="188" width={legWidth + 9} height="13" rx="6" />
        </>}
      </g>

      <g className="stone-guardian__upper">
        <rect className="stone-guardian__stone stone-guardian__stone--mid" x={torsoX - armWidth + 5} y={111 - upper * 2} width={armWidth} height={armHeight} rx={11 + upper} transform={`rotate(${6 + upper} ${torsoX - armWidth / 2} 130)`} />
        <rect className="stone-guardian__stone stone-guardian__stone--mid" x={torsoX + torsoWidth - 5} y={111 - upper * 2} width={armWidth} height={armHeight} rx={11 + upper} transform={`rotate(${-6 - upper} ${torsoX + torsoWidth + armWidth / 2} 130)`} />
        <rect className="stone-guardian__stone" x={torsoX} y={torsoY} width={torsoWidth} height={torsoHeight} rx={22 + upper * 2} />
        <path className="stone-guardian__crack" d={`M${torsoX + 14} ${torsoY + 24}l12 8-7 12 11 8`} />
        <path className="stone-guardian__crack" d={`M${torsoX + torsoWidth - 14} ${torsoY + 22}l-11 10 7 11-10 9`} />
        {upper >= 3 && <>
          <path className="stone-guardian__stone stone-guardian__shoulder" d={`M${torsoX - 3} ${torsoY + 18}l13-18 22 10-4 18z`} />
          <path className="stone-guardian__stone stone-guardian__shoulder" d={`M${torsoX + torsoWidth + 3} ${torsoY + 18}l-13-18-22 10 4 18z`} />
        </>}
      </g>

      <g className="stone-guardian__core">
        {core >= 3 && <circle className="stone-guardian__core-ring" cx="110" cy="136" r={coreRadius + 8} />}
        <path className="stone-guardian__core-mark" d={`M110 ${136 - coreRadius}L${110 + coreRadius} 136 110 ${136 + coreRadius} ${110 - coreRadius} 136Z`} />
        {core >= 4 && <path className="stone-guardian__rune" d="M110 116v-8m-20 28h-8m48 0h8m-28 20v8" />}
      </g>

      <g className="stone-guardian__head">
        <path className="stone-guardian__stone stone-guardian__stone--light" d="M72 75Q72 33 110 26q38 7 38 49l-11 25H83z" />
        <path className="stone-guardian__brow" d="M87 67l14 2m18 0l14-2" />
        {isSleeping ? (
          <path className="stone-guardian__face" d="M88 80h13m18 0h13m-30 10q8 5 16 0" />
        ) : (
          <>
            <circle className="stone-guardian__eye" cx="95" cy="79" r="4" />
            <circle className="stone-guardian__eye" cx="125" cy="79" r="4" />
            <path className="stone-guardian__face" d="M102 91q8 7 16 0" />
          </>
        )}
        <path className="stone-guardian__chip" d="M75 55l14-22 13 5-4 14z" />
      </g>

      {progress.overallLevel >= 2 && <path className="stone-guardian__growth-chip" d="M48 84l9-9 8 7-5 11z" />}
      {progress.overallLevel >= 4 && <>
        <path className="stone-guardian__growth-chip" d="M163 56l8-12 9 7-6 11z" />
        <path className="stone-guardian__rune" d="M172 72v10m-5-5h10" />
      </>}
    </svg>
  );
}
