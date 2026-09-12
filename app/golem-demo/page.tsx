'use client';

import {
  useState,
} from 'react';

import GolemAvatar from '@/components/golem/GolemAvatar';

import {
  GOLEM_COMBINATIONS,
  GOLEM_LEVEL_LABELS,
  GOLEM_PART_LABELS,
  getGolemCombinationKey,
} from '@/lib/golem/level';

import {
  GOLEM_LEVELS,
} from '@/lib/golem/types';

import type {
  GolemCombination,
  GolemGrowthPart,
  GolemLevel,
} from '@/lib/golem/types';

const DEFAULT_COMBINATION: GolemCombination = {
  upper: 0,
  lower: 0,
  core: 0,
};

const GROWTH_PARTS: readonly GolemGrowthPart[] = [
  'upper',
  'lower',
  'core',
];

export default function GolemDemoPage() {
  const [combination, setCombination] =
    useState<GolemCombination>(DEFAULT_COMBINATION);

  const [isDebugMode, setIsDebugMode] =
    useState(false);

  function changeLevel(
    part: GolemGrowthPart,
    level: GolemLevel,
  ) {
    setCombination((current) => ({
      ...current,
      [part]: level,
    }));
  }

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-4 py-10 text-[#20332a] sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <p className="text-sm font-bold tracking-[0.22em] text-[#607552]">
            CHAGOK GOLEM LAB
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            차곡 골렘 조합 데모
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#627066] sm:text-base">
            상체, 하체, 코어를 각각 Lv0부터 Lv2까지 바꾸며 총 27가지 조합을 확인할 수 있습니다.
          </p>
        </header>

        <div className="mt-6 flex justify-center">
          <button
            aria-pressed={isDebugMode}
            className={`flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
              isDebugMode
                ? 'border-[#b83280] bg-[#fff0f8] text-[#9d276c]'
                : 'border-[#cfd3c7] bg-[#fffdf7] text-[#59665d] hover:border-[#829078]'
            }`}
            onClick={() => setIsDebugMode((current) => !current)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${
                isDebugMode ? 'bg-[#db2777]' : 'bg-[#a7afa9]'
              }`}
            />
            Alignment guides {isDebugMode ? 'ON' : 'OFF'}
          </button>
        </div>

        <section className="mt-8 grid gap-6 rounded-3xl border border-[#d5d3c5] bg-[#fffdf7] p-5 shadow-sm md:grid-cols-[minmax(280px,1fr)_minmax(300px,1fr)] md:p-8">
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_center,#ffffff_0%,#ece8d8_72%)]">
            <GolemAvatar
              {...combination}
              debug={isDebugMode}
              size={300}
            />
          </div>

          <div className="flex flex-col justify-center gap-6">
            <div className="rounded-2xl bg-[#edf0e5] px-5 py-4">
              <p className="text-xs font-bold tracking-widest text-[#6b796d]">
                현재 선택
              </p>
              <p className="mt-2 text-xl font-black">
                상체 {GOLEM_LEVEL_LABELS[combination.upper]}
                {' · '}
                하체 {GOLEM_LEVEL_LABELS[combination.lower]}
                {' · '}
                코어 {GOLEM_LEVEL_LABELS[combination.core]}
              </p>
              <p className="mt-1 font-mono text-xs text-[#738077]">
                {getGolemCombinationKey(combination)}
              </p>
            </div>

            {GROWTH_PARTS.map((part) => (
              <fieldset key={part}>
                <legend className="mb-2 text-sm font-bold">
                  {GOLEM_PART_LABELS[part]}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {GOLEM_LEVELS.map((level) => {
                    const isSelected = combination[part] === level;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                          isSelected
                            ? 'border-[#37513f] bg-[#37513f] text-white'
                            : 'border-[#cfd3c7] bg-white text-[#516057] hover:border-[#829078] hover:bg-[#f5f7f1]'
                        }`}
                        key={level}
                        onClick={() => changeLevel(part, level)}
                        type="button"
                      >
                        {GOLEM_LEVEL_LABELS[level]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#607552]">
                조합 렌더링 체크
              </p>
              <h2 className="mt-1 text-2xl font-black">
                전체 27가지 조합
              </h2>
            </div>
            <span className="rounded-full bg-[#dfe7d6] px-3 py-1 text-sm font-bold">
              {GOLEM_COMBINATIONS.length} / 27
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {GOLEM_COMBINATIONS.map((item) => (
              <button
                className="rounded-2xl border border-[#d8d8ca] bg-[#fffdf7] p-2 text-center transition hover:-translate-y-0.5 hover:border-[#809174] hover:shadow-md"
                key={getGolemCombinationKey(item)}
                onClick={() => setCombination(item)}
                type="button"
              >
                <GolemAvatar
                  {...item}
                  className="mx-auto"
                  debug={isDebugMode}
                  size={112}
                />
                <span className="mt-1 block text-[11px] font-bold text-[#5d695f]">
                  U{item.upper} · L{item.lower} · C{item.core}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
