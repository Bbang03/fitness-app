'use client';

import {
  AlertCircle,
  Activity,
  Check,
  Dumbbell,
  Sparkles,
  Target,
} from 'lucide-react';

import {
  useEffect,
  useState,
} from 'react';

import type {
  DailyCommentFinding,
  DailyCommentReport,
} from '@/lib/dailyComment';
import {
  createDailyCommentAiJudgement,
  dailyCommentAiRequestKey,
  parseDailyCommentAiCopy,
  type DailyCommentAiCopy,
  type DailyCommentAiJudgement,
} from '@/lib/dailyCommentAi';

interface DailyCoachCardProps {
  report: DailyCommentReport;
}

const BODY_COMPOSITION_FINDING_IDS = new Set([
  'measured_body_composition',
  'predicted_body_composition',
  'prediction_without_measurement',
]);

function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('ko-KR', {
    maximumFractionDigits: digits,
  });
}

function findingIcon(finding: DailyCommentFinding) {
  if (finding.id === 'workout_completed') {
    return <Dumbbell size={14} aria-hidden="true" />;
  }

  if (finding.id.includes('protein') || finding.id.includes('kcal')) {
    return <Target size={14} aria-hidden="true" />;
  }

  return finding.tone === 'positive'
    ? <Check size={14} aria-hidden="true" />
    : <AlertCircle size={14} aria-hidden="true" />;
}

function findingClassName(finding: DailyCommentFinding): string {
  if (finding.tone === 'positive') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700';
  }

  if (finding.tone === 'attention') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-700';
  }

  return 'border-zinc-200 bg-zinc-50 text-zinc-600';
}

function measuredLabel(report: DailyCommentReport): string | null {
  const measured = report.bodyComposition.measured;
  if (!measured) return null;

  return `${measured.measuredAt} · ${formatNumber(measured.weightKg)}kg · 골격근량 ${formatNumber(measured.skeletalMuscleKg)}kg · 체지방률 ${formatNumber(measured.bodyFatPct)}%`;
}

function predictionLabel(report: DailyCommentReport): string | null {
  const prediction = report.bodyComposition.prediction;
  if (!prediction) return null;

  const horizon = prediction.horizonDays
    ? `${prediction.horizonDays}일 예측`
    : '예측';
  const values = [
    prediction.predictedWeightKg !== null
      ? `${formatNumber(prediction.predictedWeightKg)}kg`
      : null,
    prediction.predictedSkeletalMuscleKg !== null
      ? `골격근량 ${formatNumber(prediction.predictedSkeletalMuscleKg)}kg`
      : null,
    prediction.predictedBodyFatPct !== null
      ? `체지방률 ${formatNumber(prediction.predictedBodyFatPct)}%`
      : null,
  ].filter(Boolean);
  const confidence = prediction.confidence
    ? `신뢰도 ${prediction.confidence === 'high' ? '높음' : prediction.confidence === 'medium' ? '보통' : '낮음'}`
    : null;
  const estimateNote = '참고용 추정치';

  return values.length > 0
    ? `${horizon} · ${values.join(' · ')} · ${confidence ?? '신뢰도 미상'} · ${estimateNote}`
    : `${horizon} · ${confidence ?? '신뢰도 미상'} · ${estimateNote}`;
}

function BodyCompositionLines({ report }: DailyCoachCardProps) {
  const measured = measuredLabel(report);
  const prediction = predictionLabel(report);

  if (!measured && !prediction) {
    return (
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        체성분 실측 기록이 없어 예측을 표시하지 않았어요.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2 text-xs leading-5">
      {measured && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
            실측
          </span>
          <span className="min-w-0 text-zinc-600">{measured}</span>
        </div>
      )}
      {prediction && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
            예측
          </span>
          <span className="min-w-0 text-zinc-600">{prediction}</span>
        </div>
      )}
      {measured && !prediction && (
        <p className="text-zinc-500">
          최근 기록이 충분히 쌓이면 30일 예측을 표시해요.
        </p>
      )}
    </div>
  );
}

export default function DailyCoachCard({ report }: DailyCoachCardProps) {
  const [aiCopy, setAiCopy] = useState<DailyCommentAiCopy | null>(null);
  const [aiState, setAiState] = useState<
    'idle' | 'loading' | 'enhanced' | 'fallback' | 'error'
  >('idle');

  // The key is derived only from the compact judgement. It changes when the
  // date or a rule result changes, while unrelated dashboard renders do not
  // restart the request.
  const requestKey = dailyCommentAiRequestKey(
    createDailyCommentAiJudgement(report),
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const judgement = JSON.parse(requestKey) as DailyCommentAiJudgement;

    setAiCopy(null);
    setAiState('loading');

    void fetch('/api/daily-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestKey,
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload !== 'object') {
          throw new Error('daily-comment request failed');
        }

        const rawCopy = (payload as { copy?: unknown }).copy;
        const copy = parseDailyCommentAiCopy(rawCopy, judgement);
        if (!copy) throw new Error('daily-comment response rejected');

        if (!active) return;

        const source = (payload as { source?: unknown }).source;
        setAiCopy(source === 'llm' ? copy : null);
        setAiState(source === 'llm' ? 'enhanced' : 'fallback');
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }

        setAiCopy(null);
        setAiState('error');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestKey]);

  const evidence = report.evidence
    .filter((item) => !BODY_COMPOSITION_FINDING_IDS.has(item.id))
    .slice(0, 3);
  const titleId = `daily-coach-title-${report.date}`;
  const displayedComment = aiCopy?.comment ?? report.comment;
  const displayedPositivePoint = aiCopy?.positivePoint ?? report.positivePoint;
  const displayedNextAction = aiCopy?.nextAction ?? report.nextAction;

  return (
    <article
      className="apple-card mt-6 overflow-hidden p-5"
      aria-labelledby={titleId}
    >
      <header className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Sparkles size={16} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">
            Daily coach
          </p>
          <h2 id={titleId} className="mt-0.5 text-base font-bold text-zinc-900">
            오늘의 코치 코멘트
          </h2>
        </div>
      </header>

      <p className="mt-5 text-lg font-bold leading-7 tracking-[-0.02em] text-zinc-900">
        {displayedComment}
      </p>

      {(aiState === 'loading' || aiState === 'fallback' || aiState === 'error') && (
        <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
          {aiState === 'loading'
            ? '코치 문장을 자연스럽게 다듬는 중이에요.'
            : '기본 코치 코멘트를 보여드리고 있어요.'}
        </p>
      )}

      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4 text-sm leading-6">
        {displayedPositivePoint && (
          <p className="flex items-start gap-2 text-emerald-700">
            <Check className="mt-1 shrink-0" size={15} aria-hidden="true" />
            <span><span className="font-semibold">잘한 점</span> · {displayedPositivePoint}</span>
          </p>
        )}
        <p className="flex items-start gap-2 text-zinc-700">
          <Target className="mt-1 shrink-0 text-blue-600" size={15} aria-hidden="true" />
          <span><span className="font-semibold">다음 행동</span> · {displayedNextAction}</span>
        </p>
      </div>

      {evidence.length > 0 && (
        <section className="mt-5" aria-labelledby={`${titleId}-evidence`}>
          <h3 id={`${titleId}-evidence`} className="text-xs font-semibold text-zinc-500">
            판단 근거
          </h3>
          <ul className="mt-2 space-y-2">
            {evidence.map((item) => (
              <li
                key={item.id}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ${findingClassName(item)}`}
              >
                <span className="mt-0.5 shrink-0">{findingIcon(item)}</span>
                <span className="min-w-0">
                  <span className="font-semibold">{item.label}</span>
                  <span className="ml-1.5 opacity-80">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="mt-5 border-t border-zinc-100 pt-4"
        aria-labelledby={`${titleId}-body-composition`}
      >
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-zinc-400" aria-hidden="true" />
          <h3 id={`${titleId}-body-composition`} className="text-xs font-semibold text-zinc-500">
            체성분 흐름
          </h3>
        </div>
        <BodyCompositionLines report={report} />
      </section>
    </article>
  );
}
