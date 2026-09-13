import type {
  CSSProperties,
  ReactNode,
} from 'react';

import Image from 'next/image';

import {
  GOLEM_ASSET_SOURCES,
} from '@/lib/golem/level';

import type {
  GolemAvatarProps,
  GolemLevel,
} from '@/lib/golem/types';

const STONE_BY_LEVEL: Record<GolemLevel, string> = {
  0: '#8d9873',
  1: '#71805b',
  2: '#566a43',
};

const STONE_LIGHT_BY_LEVEL: Record<GolemLevel, string> = {
  0: '#aeb896',
  1: '#91a174',
  2: '#718958',
};

const outline = '2px solid #24372d';

const ASSET_CANVAS_SIZE_AT_300 = 300;
const AVATAR_STAGE_HEIGHT_AT_300 = 425;
const AVATAR_STAGE_HEIGHT_RATIO =
  AVATAR_STAGE_HEIGHT_AT_300 / ASSET_CANVAS_SIZE_AT_300;
const LOWER_ANCHOR_AT_300 = 203;
const HEAD_ASSET_TRANSLATE_Y_AT_300 = -6;

const LOWER_ASSET_TRANSLATE_Y_AT_300: Record<GolemLevel, number> = {
  0: 93.8,
  1: 136.3,
  2: 147.1,
};

const LOWER_ASSET_BOTTOM_AT_300: Record<GolemLevel, number> = {
  0: 333,
  1: 399,
  2: 424,
};

interface AssetLayerProps {
  source: string | null;
  label: string;
  style: CSSProperties;
  actualStyle?: CSSProperties;
  children: ReactNode;
}

function AssetLayer({
  source,
  label,
  style,
  actualStyle,
  children,
}: AssetLayerProps) {
  if (source) {
    return (
      <div
        data-golem-actual-layer={label}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: style.zIndex,
          ...actualStyle,
        }}
      >
        <Image
          alt=""
          aria-hidden="true"
          data-asset-source={source}
          data-golem-layer={label}
          fill
          sizes="300px"
          src={source}
          style={{
            objectFit: 'contain',
            objectPosition: 'center',
          }}
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      data-asset-source="placeholder"
      data-golem-layer={label}
      style={style}
    >
      {children}
    </div>
  );
}

function HeadPlaceholder() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: '18% 5% 2%',
          border: outline,
          borderRadius: '38% 35% 30% 34%',
          background: 'linear-gradient(135deg, #b8bd91 0%, #8f9870 72%)',
          boxShadow: 'inset 8px -7px 0 rgb(50 70 50 / 16%)',
        }}
      >
        <div style={{ position: 'absolute', left: '27%', top: '48%', width: '8%', height: '20%', borderRadius: 999, background: '#182b28' }} />
        <div style={{ position: 'absolute', right: '27%', top: '48%', width: '8%', height: '20%', borderRadius: 999, background: '#182b28' }} />
        <div style={{ position: 'absolute', left: '13%', top: '1%', width: '30%', height: '22%', borderRadius: '60% 35%', background: '#597541' }} />
      </div>
      <div style={{ position: 'absolute', left: '48%', top: '2%', width: '4%', height: '22%', borderRadius: 999, background: '#385235', transform: 'rotate(-8deg)' }} />
      <div style={{ position: 'absolute', left: '36%', top: '0%', width: '17%', height: '12%', borderRadius: '100% 10% 100% 10%', background: '#6d934d', transform: 'rotate(35deg)' }} />
      <div style={{ position: 'absolute', right: '34%', top: '-2%', width: '17%', height: '12%', borderRadius: '10% 100% 10% 100%', background: '#82a757', transform: 'rotate(-27deg)' }} />
    </>
  );
}

function UpperPlaceholder({ level }: { level: GolemLevel }) {
  const armScale = 0.82 + level * 0.13;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: '18%',
          top: '8%',
          width: '64%',
          height: '76%',
          border: outline,
          borderRadius: '27% 27% 18% 18%',
          background: `linear-gradient(145deg, ${STONE_LIGHT_BY_LEVEL[level]}, ${STONE_BY_LEVEL[level]})`,
          boxShadow: 'inset 7px -7px 0 rgb(35 55 38 / 18%)',
        }}
      />
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          style={{
            position: 'absolute',
            [side]: level === 2 ? '-5%' : '0%',
            top: level === 0 ? '22%' : '12%',
            width: level === 0 ? '24%' : '29%',
            height: level === 0 ? '60%' : '76%',
            border: outline,
            borderRadius: level === 2 ? '45% 35% 40% 35%' : '45%',
            background: `linear-gradient(145deg, ${STONE_LIGHT_BY_LEVEL[level]}, ${STONE_BY_LEVEL[level]})`,
            boxShadow: 'inset 5px -6px 0 rgb(35 55 38 / 18%)',
            transform: `scale(${armScale}) rotate(${side === 'left' ? 13 : -13}deg)`,
          }}
        />
      ))}
      {level > 0 ? (
        <>
          <div style={{ position: 'absolute', left: '8%', top: '16%', width: '14%', height: '17%', borderRadius: '50%', background: '#647f49' }} />
          <div style={{ position: 'absolute', right: '8%', top: '16%', width: '14%', height: '17%', borderRadius: '50%', background: '#647f49' }} />
        </>
      ) : null}
    </>
  );
}

function LowerPlaceholder({ level }: { level: GolemLevel }) {
  const legWidth = 27 + level * 4;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: '24%',
          top: '2%',
          width: '52%',
          height: '28%',
          border: outline,
          borderRadius: '18%',
          background: STONE_BY_LEVEL[level],
        }}
      />
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          style={{
            position: 'absolute',
            [side]: level === 2 ? '9%' : '15%',
            bottom: '4%',
            width: `${legWidth}%`,
            height: `${57 + level * 8}%`,
            border: outline,
            borderRadius: level === 2 ? '42% 42% 22% 22%' : '35% 35% 24% 24%',
            background: `linear-gradient(145deg, ${STONE_LIGHT_BY_LEVEL[level]}, ${STONE_BY_LEVEL[level]})`,
            boxShadow: 'inset 5px -6px 0 rgb(35 55 38 / 18%)',
            transform: `rotate(${side === 'left' ? 4 : -4}deg)`,
          }}
        />
      ))}
      {level === 2 ? (
        <div style={{ position: 'absolute', right: '11%', bottom: '26%', width: '20%', height: '12%', borderRadius: '50%', background: '#5f7d45' }} />
      ) : null}
    </>
  );
}

function CorePlaceholder({ level }: { level: GolemLevel }) {
  const dimensions = [22, 27, 31] as const;
  const dimension = dimensions[level];
  const rotation = level === 2 ? 45 : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${dimension}%`,
        aspectRatio: '1',
        border: '2px solid #f7bd4d',
        borderRadius: level === 2 ? '18%' : '28%',
        background: level === 0 ? '#ffe3a0' : '#ffd36c',
        boxShadow: `0 0 ${6 + level * 5}px ${level * 2}px rgb(255 174 55 / 72%), inset 0 0 5px #fff7d1`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}
    />
  );
}

interface DebugFrameProps {
  color: string;
  label: string;
  lineStyle?: 'dashed' | 'dotted';
  style: CSSProperties;
  showLabel: boolean;
}

function DebugFrame({
  color,
  label,
  lineStyle = 'dashed',
  style,
  showLabel,
}: DebugFrameProps) {
  return (
    <div
      data-golem-debug-frame={label.toLowerCase()}
      style={{
        ...style,
        position: 'absolute',
        border: `1px ${lineStyle} ${color}`,
      }}
    >
      {showLabel ? (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            padding: '1px 3px',
            background: color,
            color: '#ffffff',
            fontFamily: 'monospace',
            fontSize: 8,
            lineHeight: 1.2,
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

function DebugGuides({
  showLabels,
  size,
}: {
  showLabels: boolean;
  size: number;
}) {
  const stageHeight = size * AVATAR_STAGE_HEIGHT_RATIO;
  const lowerAnchor = size * LOWER_ANCHOR_AT_300 / ASSET_CANVAS_SIZE_AT_300;

  return (
    <div
      aria-hidden="true"
      data-golem-debug-guides="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          borderLeft: '1px solid rgb(219 39 119 / 72%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: size * 0.5,
          borderTop: '1px solid rgb(219 39 119 / 45%)',
        }}
      />
      <DebugFrame
        color="rgb(124 58 237 / 82%)"
        label="HEAD"
        lineStyle="dotted"
        showLabel={showLabels}
        style={{ left: size * 0.26, top: size * 0.03, width: size * 0.48, height: size * 0.36 }}
      />
      <DebugFrame
        color="rgb(37 99 235 / 72%)"
        label="LOWER"
        showLabel={showLabels}
        style={{ left: size * 0.2, top: lowerAnchor, width: size * 0.6, height: stageHeight - lowerAnchor }}
      />
      <DebugFrame
        color="rgb(22 163 74 / 72%)"
        label="UPPER"
        showLabel={showLabels}
        style={{ left: size * 0.12, top: size * 0.33, width: size * 0.76, height: size * 0.39 }}
      />
      <DebugFrame
        color="rgb(234 88 12 / 78%)"
        label="CORE"
        showLabel={showLabels}
        style={{ left: size * 0.33, top: size * 0.42, width: size * 0.34, height: size * 0.24 }}
      />
    </div>
  );
}

export default function GolemAvatar({
  upper,
  lower,
  core,
  size = 240,
  className,
  debug = false,
}: GolemAvatarProps) {
  const stageHeight = size * AVATAR_STAGE_HEIGHT_RATIO;
  const lowerAssetSource = GOLEM_ASSET_SOURCES.lower[lower];
  const lowerTranslateY =
    LOWER_ASSET_TRANSLATE_Y_AT_300[lower] / ASSET_CANVAS_SIZE_AT_300 * 100;
  const lowerBottom =
    size * LOWER_ASSET_BOTTOM_AT_300[lower] / ASSET_CANVAS_SIZE_AT_300;
  const shadowHeight = size / 30;
  const shadowTop = Math.min(
    stageHeight - shadowHeight,
    lowerBottom - shadowHeight * 0.4,
  );

  return (
    <div
      aria-label={`차곡 골렘, 상체 레벨 ${upper}, 하체 레벨 ${lower}, 코어 레벨 ${core}`}
      className={className}
      data-core-level={core}
      data-debug={debug ? 'on' : 'off'}
      data-lower-level={lower}
      data-stage-height={stageHeight}
      data-upper-level={upper}
      role="img"
      style={{
        position: 'relative',
        width: size,
        height: stageHeight,
        flexShrink: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '20%',
          top: shadowTop,
          width: '60%',
          height: shadowHeight,
          borderRadius: '50%',
          background: 'rgb(49 61 42 / 18%)',
          filter: 'blur(2px)',
          zIndex: 0,
        }}
      />

      <div
        data-golem-asset-canvas="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
        }}
      >
        <AssetLayer
          actualStyle={{ transform: `translateY(${lowerTranslateY}%)` }}
          label={`하체 Lv${lower}`}
          source={lowerAssetSource}
          style={{ position: 'absolute', left: '20%', top: '62%', width: '60%', height: '36%', zIndex: 1 }}
        >
          <LowerPlaceholder level={lower} />
        </AssetLayer>

        <AssetLayer
          label={`상체 Lv${upper}`}
          source={GOLEM_ASSET_SOURCES.upper[upper]}
          style={{ position: 'absolute', left: '12%', top: '33%', width: '76%', height: '39%', zIndex: 2 }}
        >
          <UpperPlaceholder level={upper} />
        </AssetLayer>

        <AssetLayer
          label={`코어 Lv${core}`}
          source={GOLEM_ASSET_SOURCES.core[core]}
          style={{ position: 'absolute', left: '33%', top: '42%', width: '34%', height: '24%', zIndex: 3 }}
        >
          <CorePlaceholder level={core} />
        </AssetLayer>

        <AssetLayer
          actualStyle={{ transform: `translateY(${HEAD_ASSET_TRANSLATE_Y_AT_300 / ASSET_CANVAS_SIZE_AT_300 * 100}%)` }}
          label="기본 헤드"
          source={GOLEM_ASSET_SOURCES.head}
          style={{ position: 'absolute', left: '26%', top: '3%', width: '48%', height: '36%', zIndex: 4 }}
        >
          <HeadPlaceholder />
        </AssetLayer>
      </div>

      {debug ? (
        <DebugGuides showLabels={size >= 180} size={size} />
      ) : null}
    </div>
  );
}
