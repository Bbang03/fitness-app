'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Dumbbell,
  Loader2,
  Moon,
  Target,
  UtensilsCrossed,
} from 'lucide-react';

import type {
  ActivityLevel,
  DietExperience,
  PrimaryGoal,
  TrainingConsistency,
} from '@/lib/types';

type OnboardingData = {
  recent_training_frequency:
    | number
    | null;

  average_session_minutes:
    | number
    | null;

  training_consistency:
    | TrainingConsistency
    | null;

  activity_level:
    | ActivityLevel
    | null;

  average_sleep_hours:
    | number
    | null;

  primary_goal:
    | PrimaryGoal
    | null;

  diet_experience:
    | DietExperience
    | null;

  typical_meals_per_day:
    | number
    | null;
};

const TOTAL_STEPS = 9;

const initialData: OnboardingData = {
  recent_training_frequency: null,
  average_session_minutes: null,
  training_consistency: null,
  activity_level: null,
  average_sleep_hours: null,
  primary_goal: null,
  diet_experience: null,
  typical_meals_per_day: null,
};

function ChoiceButton({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border px-4 py-4 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className={`font-medium ${
              selected
                ? 'text-blue-300'
                : 'text-zinc-100'
            }`}
          >
            {title}
          </p>

          {description && (
            <p className="text-xs text-zinc-500 mt-1">
              {description}
            </p>
          )}
        </div>

        <div
          className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${
            selected
              ? 'border-blue-500 bg-blue-500'
              : 'border-zinc-700'
          }`}
        >
          {selected && (
            <Check
              size={14}
              strokeWidth={3}
            />
          )}
        </div>
      </div>
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] =
    useState(0);

  const [
    trainingYears,
    setTrainingYears,
  ] = useState(0);

  const [
    trainingMonths,
    setTrainingMonths,
  ] = useState(0);

  const [data, setData] =
    useState<OnboardingData>(
      initialData,
    );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [error, setError] =
    useState('');

  // ─────────────────────────────────────────────
  // 온보딩 페이지 진입 검사
  // ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const checkUser = async () => {
      const supabase =
        createClient();

      try {
        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (cancelled) {
          return;
        }

        // 로그인되지 않은 사용자
        if (
          userError ||
          !user
        ) {
          router.replace(
            '/login',
          );

          return;
        }

        // 이메일 인증이 되지 않은 사용자는
        // 온보딩 접근 자체를 허용하지 않음
        if (
          !user.email_confirmed_at
        ) {
          await supabase.auth.signOut({
            scope: 'local',
          });

          if (cancelled) {
            return;
          }

          router.replace(
            '/login',
          );

          return;
        }

        // 이미 온보딩을 완료한 사용자 확인
        const {
          data:
            existingProfile,
          error:
            predictionError,
        } =
          await supabase
            .from(
              'prediction_profiles',
            )
            .select('user_id')
            .eq(
              'user_id',
              user.id,
            )
            .maybeSingle();

        if (cancelled) {
          return;
        }

        if (predictionError) {
          console.error(
            'Prediction profile check failed:',
            predictionError.message,
          );

          setError(
            '온보딩 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
          );

          setIsLoading(false);

          return;
        }

        // 이미 설문이 저장된 사용자
        if (existingProfile) {
          router.replace(
            '/dashboard',
          );

          return;
        }

        // 정상적으로 설문 시작
        setIsLoading(false);
      } catch (
        checkError
      ) {
        console.error(
          'Onboarding user check failed:',
          checkError,
        );

        if (!cancelled) {
          setError(
            '사용자 정보를 확인하는 중 문제가 발생했습니다.',
          );

          setIsLoading(
            false,
          );
        }
      }
    };

    void checkUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const progress =
    useMemo(
      () =>
        ((step + 1) /
          TOTAL_STEPS) *
        100,
      [step],
    );

  const trainingExperienceMonths =
    trainingYears * 12 +
    trainingMonths;

  const updateData = <
    K extends keyof OnboardingData,
  >(
    key: K,
    value:
      OnboardingData[K],
  ) => {
    setData((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (error) {
      setError('');
    }
  };

  const canContinue = () => {
    switch (step) {
      case 0:
        // 운동 경험 0개월도 정상적인 값
        return true;

      case 1:
        return (
          data.recent_training_frequency !==
          null
        );

      case 2:
        return (
          data.average_session_minutes !==
          null
        );

      case 3:
        return (
          data.training_consistency !==
          null
        );

      case 4:
        return (
          data.activity_level !==
          null
        );

      case 5:
        return (
          data.average_sleep_hours !==
          null
        );

      case 6:
        return (
          data.primary_goal !==
          null
        );

      case 7:
        return (
          data.diet_experience !==
          null
        );

      case 8:
        return (
          data.typical_meals_per_day !==
          null
        );

      default:
        return false;
    }
  };

  const nextStep = () => {
    if (!canContinue()) {
      return;
    }

    setError('');

    if (
      step <
      TOTAL_STEPS - 1
    ) {
      setStep(
        (prev) =>
          prev + 1,
      );
    }
  };

  const prevStep = () => {
    setError('');

    if (step === 0) {
      router.back();
      return;
    }

    setStep(
      (prev) =>
        prev - 1,
    );
  };

  // ─────────────────────────────────────────────
  // 최종 설문 저장
  // ─────────────────────────────────────────────

  const handleSubmit =
    async () => {
      if (isSaving) {
        return;
      }

      if (
        !canContinue()
      ) {
        return;
      }

      if (
        data.recent_training_frequency ===
          null ||
        data.average_session_minutes ===
          null ||
        data.training_consistency ===
          null ||
        data.activity_level ===
          null ||
        data.average_sleep_hours ===
          null ||
        data.primary_goal ===
          null ||
        data.diet_experience ===
          null ||
        data.typical_meals_per_day ===
          null
      ) {
        setError(
          '아직 입력하지 않은 항목이 있습니다.',
        );

        return;
      }

      setIsSaving(true);
      setError('');

      const supabase =
        createClient();

      try {
        // 저장 직전 다시 인증 사용자 확인
        const {
          data: {
            user,
          },
          error:
            userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          setError(
            '로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.',
          );

          return;
        }

        // 이메일 미인증 상태에서는 저장 금지
        if (
          !user.email_confirmed_at
        ) {
          await supabase.auth.signOut({
            scope: 'local',
          });

          router.replace(
            '/login',
          );

          return;
        }

        // 이미 다른 탭 등에서 온보딩을 완료했는지 재확인
        const {
          data:
            existingProfile,
          error:
            existingError,
        } =
          await supabase
            .from(
              'prediction_profiles',
            )
            .select('user_id')
            .eq(
              'user_id',
              user.id,
            )
            .maybeSingle();

        if (existingError) {
          console.error(
            'Existing prediction profile check failed:',
            existingError.message,
          );

          setError(
            '온보딩 상태를 확인하지 못했습니다. 다시 시도해주세요.',
          );

          return;
        }

        if (existingProfile) {
          router.replace(
            '/dashboard',
          );

          return;
        }

        const now =
          new Date().toISOString();

        // 이 페이지에서 prediction_profiles가
        // 생성되는 유일한 위치
        const {
          error:
            saveError,
        } =
          await supabase
            .from(
              'prediction_profiles',
            )
            .insert({
              user_id:
                user.id,

              training_experience_months:
                trainingExperienceMonths,

              recent_training_frequency:
                data.recent_training_frequency,

              average_session_minutes:
                data.average_session_minutes,

              training_consistency:
                data.training_consistency,

              activity_level:
                data.activity_level,

              average_sleep_hours:
                data.average_sleep_hours,

              primary_goal:
                data.primary_goal,

              diet_experience:
                data.diet_experience,

              typical_meals_per_day:
                data.typical_meals_per_day,

              updated_at:
                now,
            });

        if (saveError) {
          console.error(
            'Prediction profile save failed:',
            saveError.message,
          );

          setError(
            '설문 저장에 실패했습니다. 다시 시도해주세요.',
          );

          return;
        }

        // 저장 완료 후에만 대시보드 이동
        router.replace(
          '/dashboard',
        );
      } catch (
        submitError
      ) {
        console.error(
          'Onboarding submit failed:',
          submitError,
        );

        setError(
          '설문 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        );
      } finally {
        setIsSaving(false);
      }
    };

  // ─────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            size={24}
            className="text-blue-400 animate-spin"
          />

          <p className="text-sm text-zinc-500">
            사용자 정보를 확인하는 중...
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Main
  // ─────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 pt-10 pb-4">
        <div className="flex items-center justify-between mb-5">
          <button
            type="button"
            onClick={
              prevStep
            }
            disabled={
              isSaving
            }
            className="text-zinc-400 hover:text-white p-1 -ml-1 disabled:opacity-40"
          >
            <ArrowLeft
              size={22}
            />
          </button>

          <span className="text-xs text-zinc-500">
            {step + 1} /{' '}
            {TOTAL_STEPS}
          </span>
        </div>

        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{
              width:
                `${progress}%`,
            }}
          />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 pt-5 pb-6">
        {/* Step 1 */}
        {step === 0 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5">
              <Dumbbell
                size={22}
                className="text-blue-400"
              />
            </div>

            <p className="text-sm text-blue-400 font-medium mb-2">
              운동 경험
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              웨이트 트레이닝을
              <br />
              얼마나 오래 하셨나요?
            </h1>

            <p className="text-sm text-zinc-500 mt-3">
              실제 운동한 기간을 대략 입력해주세요.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-2 block">
                  년
                </label>

                <select
                  value={
                    trainingYears
                  }
                  onChange={(
                    e,
                  ) => {
                    setTrainingYears(
                      Number(
                        e.target
                          .value,
                      ),
                    );

                    setError('');
                  }}
                  disabled={
                    isSaving
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  {Array.from({
                    length: 16,
                  }).map(
                    (
                      _,
                      i,
                    ) => (
                      <option
                        key={
                          i
                        }
                        value={
                          i
                        }
                      >
                        {i}
                        년
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-2 block">
                  개월
                </label>

                <select
                  value={
                    trainingMonths
                  }
                  onChange={(
                    e,
                  ) => {
                    setTrainingMonths(
                      Number(
                        e.target
                          .value,
                      ),
                    );

                    setError('');
                  }}
                  disabled={
                    isSaving
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  {Array.from({
                    length: 12,
                  }).map(
                    (
                      _,
                      i,
                    ) => (
                      <option
                        key={
                          i
                        }
                        value={
                          i
                        }
                      >
                        {i}
                        개월
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            <div className="mt-4 bg-zinc-900 rounded-2xl px-4 py-3">
              <p className="text-sm text-zinc-400">
                총 운동 구력
              </p>

              <p className="text-lg font-bold mt-1">
                {trainingExperienceMonths ===
                0
                  ? '처음 시작'
                  : `${trainingExperienceMonths}개월`}
              </p>
            </div>
          </section>
        )}

        {/* Step 2 */}
        {step === 1 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-5">
              <CalendarDays
                size={22}
                className="text-orange-400"
              />
            </div>

            <p className="text-sm text-orange-400 font-medium mb-2">
              최근 운동 빈도
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              최근 3개월 동안
              <br />
              주 몇 회 운동했나요?
            </h1>

            <p className="text-sm text-zinc-500 mt-3 mb-7">
              웨이트와 주요 운동을 기준으로 선택해주세요.
            </p>

            <div className="space-y-2">
              {[
                0,
                1,
                2,
                3,
                4,
                5,
                6,
                7,
              ].map(
                (
                  count,
                ) => (
                  <ChoiceButton
                    key={
                      count
                    }
                    selected={
                      data.recent_training_frequency ===
                      count
                    }
                    title={
                      count ===
                      0
                        ? '거의 하지 않음'
                        : count ===
                            7
                          ? '주 7회 이상'
                          : `주 ${count}회`
                    }
                    onClick={() =>
                      updateData(
                        'recent_training_frequency',
                        count,
                      )
                    }
                  />
                ),
              )}
            </div>
          </section>
        )}

        {/* Step 3 */}
        {step === 2 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5">
              <Clock3
                size={22}
                className="text-blue-400"
              />
            </div>

            <p className="text-sm text-blue-400 font-medium mb-2">
              평균 운동 시간
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              한 번 운동할 때
              <br />
              평균 얼마나 운동하나요?
            </h1>

            <p className="text-sm text-zinc-500 mt-3 mb-7">
              준비운동을 포함한 대략적인 시간입니다.
            </p>

            <div className="space-y-2">
              {[
                30,
                45,
                60,
                75,
                90,
                120,
                150,
              ].map(
                (
                  minutes,
                ) => (
                  <ChoiceButton
                    key={
                      minutes
                    }
                    selected={
                      data.average_session_minutes ===
                      minutes
                    }
                    title={
                      minutes ===
                      150
                        ? '150분 이상'
                        : `${minutes}분 정도`
                    }
                    onClick={() =>
                      updateData(
                        'average_session_minutes',
                        minutes,
                      )
                    }
                  />
                ),
              )}
            </div>
          </section>
        )}

        {/* Step 4 */}
        {step === 3 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
              <Activity
                size={22}
                className="text-emerald-400"
              />
            </div>

            <p className="text-sm text-emerald-400 font-medium mb-2">
              운동 규칙성
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              최근 운동은 얼마나
              <br />
              꾸준했나요?
            </h1>

            <div className="space-y-3 mt-8">
              <ChoiceButton
                selected={
                  data.training_consistency ===
                  'irregular'
                }
                title="불규칙했어요"
                description="운동하는 주와 쉬는 주가 자주 바뀌었어요."
                onClick={() =>
                  updateData(
                    'training_consistency',
                    'irregular',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.training_consistency ===
                  'somewhat_consistent'
                }
                title="대체로 꾸준했어요"
                description="가끔 쉬었지만 비교적 일정하게 운동했어요."
                onClick={() =>
                  updateData(
                    'training_consistency',
                    'somewhat_consistent',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.training_consistency ===
                  'consistent'
                }
                title="매우 꾸준했어요"
                description="대부분의 주에 계획대로 운동했어요."
                onClick={() =>
                  updateData(
                    'training_consistency',
                    'consistent',
                  )
                }
              />
            </div>
          </section>
        )}

        {/* Step 5 */}
        {step === 4 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-5">
              <Activity
                size={22}
                className="text-violet-400"
              />
            </div>

            <p className="text-sm text-violet-400 font-medium mb-2">
              일상 활동량
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              운동 외 시간에는
              <br />
              얼마나 활동적인가요?
            </h1>

            <div className="space-y-3 mt-8">
              <ChoiceButton
                selected={
                  data.activity_level ===
                  'sedentary'
                }
                title="대부분 앉아서 생활해요"
                description="학생, 사무직 등 앉아 있는 시간이 매우 길어요."
                onClick={() =>
                  updateData(
                    'activity_level',
                    'sedentary',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.activity_level ===
                  'light'
                }
                title="가벼운 활동이 있어요"
                description="짧은 이동이나 걷기가 조금 있어요."
                onClick={() =>
                  updateData(
                    'activity_level',
                    'light',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.activity_level ===
                  'moderate'
                }
                title="보통 수준이에요"
                description="걷거나 움직이는 시간이 꽤 있어요."
                onClick={() =>
                  updateData(
                    'activity_level',
                    'moderate',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.activity_level ===
                  'active'
                }
                title="활동적인 편이에요"
                description="하루 동안 움직이는 시간이 많아요."
                onClick={() =>
                  updateData(
                    'activity_level',
                    'active',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.activity_level ===
                  'very_active'
                }
                title="매우 활동적이에요"
                description="육체적인 활동이 많은 생활을 해요."
                onClick={() =>
                  updateData(
                    'activity_level',
                    'very_active',
                  )
                }
              />
            </div>
          </section>
        )}

        {/* Step 6 */}
        {step === 5 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-5">
              <Moon
                size={22}
                className="text-indigo-400"
              />
            </div>

            <p className="text-sm text-indigo-400 font-medium mb-2">
              수면
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              하루 평균 수면 시간은
              <br />
              어느 정도인가요?
            </h1>

            <div className="grid grid-cols-2 gap-2 mt-8">
              {[
                4,
                5,
                6,
                6.5,
                7,
                7.5,
                8,
                9,
              ].map(
                (
                  hours,
                ) => (
                  <ChoiceButton
                    key={
                      hours
                    }
                    selected={
                      data.average_sleep_hours ===
                      hours
                    }
                    title={`${hours}시간`}
                    onClick={() =>
                      updateData(
                        'average_sleep_hours',
                        hours,
                      )
                    }
                  />
                ),
              )}
            </div>
          </section>
        )}

        {/* Step 7 */}
        {step === 6 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-5">
              <Target
                size={22}
                className="text-rose-400"
              />
            </div>

            <p className="text-sm text-rose-400 font-medium mb-2">
              목표
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              지금 가장 중요한
              <br />
              목표는 무엇인가요?
            </h1>

            <div className="space-y-3 mt-8">
              <ChoiceButton
                selected={
                  data.primary_goal ===
                  'fat_loss'
                }
                title="체지방 감량"
                description="체중과 체지방을 줄이는 것이 가장 중요해요."
                onClick={() =>
                  updateData(
                    'primary_goal',
                    'fat_loss',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.primary_goal ===
                  'muscle_gain'
                }
                title="근육 증가"
                description="골격근량과 근력을 늘리는 것이 중요해요."
                onClick={() =>
                  updateData(
                    'primary_goal',
                    'muscle_gain',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.primary_goal ===
                  'recomposition'
                }
                title="바디 리컴포지션"
                description="체지방은 줄이고 근육은 늘리고 싶어요."
                onClick={() =>
                  updateData(
                    'primary_goal',
                    'recomposition',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.primary_goal ===
                  'maintenance'
                }
                title="현재 체형 유지"
                description="현재 체중과 체성분을 안정적으로 유지하고 싶어요."
                onClick={() =>
                  updateData(
                    'primary_goal',
                    'maintenance',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.primary_goal ===
                  'fitness'
                }
                title="전반적인 체력 향상"
                description="특정 체성분보다 건강과 운동 능력이 중요해요."
                onClick={() =>
                  updateData(
                    'primary_goal',
                    'fitness',
                  )
                }
              />
            </div>
          </section>
        )}

        {/* Step 8 */}
        {step === 7 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
              <UtensilsCrossed
                size={22}
                className="text-emerald-400"
              />
            </div>

            <p className="text-sm text-emerald-400 font-medium mb-2">
              식단 관리
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              칼로리나 탄단지를
              <br />
              관리해본 경험이 있나요?
            </h1>

            <div className="space-y-3 mt-8">
              <ChoiceButton
                selected={
                  data.diet_experience ===
                  'none'
                }
                title="거의 없어요"
                description="칼로리나 영양소를 따로 기록한 적이 거의 없어요."
                onClick={() =>
                  updateData(
                    'diet_experience',
                    'none',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.diet_experience ===
                  'beginner'
                }
                title="조금 해봤어요"
                description="가끔 칼로리나 단백질을 확인해본 적이 있어요."
                onClick={() =>
                  updateData(
                    'diet_experience',
                    'beginner',
                  )
                }
              />

              <ChoiceButton
                selected={
                  data.diet_experience ===
                  'experienced'
                }
                title="꾸준히 관리해봤어요"
                description="칼로리나 탄단지를 장기간 기록한 경험이 있어요."
                onClick={() =>
                  updateData(
                    'diet_experience',
                    'experienced',
                  )
                }
              />
            </div>
          </section>
        )}

        {/* Step 9 */}
        {step === 8 && (
          <section>
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5">
              <UtensilsCrossed
                size={22}
                className="text-amber-400"
              />
            </div>

            <p className="text-sm text-amber-400 font-medium mb-2">
              식사 패턴
            </p>

            <h1 className="text-2xl font-bold leading-snug">
              하루에 보통 몇 번
              <br />
              식사하나요?
            </h1>

            <p className="text-sm text-zinc-500 mt-3 mb-7">
              간식을 포함한 평균적인 횟수를 선택해주세요.
            </p>

            <div className="space-y-2">
              {[
                1,
                2,
                3,
                4,
                5,
                6,
              ].map(
                (
                  count,
                ) => (
                  <ChoiceButton
                    key={
                      count
                    }
                    selected={
                      data.typical_meals_per_day ===
                      count
                    }
                    title={
                      count ===
                      6
                        ? '하루 6회 이상'
                        : `하루 ${count}회`
                    }
                    onClick={() =>
                      updateData(
                        'typical_meals_per_day',
                        count,
                      )
                    }
                  />
                ),
              )}
            </div>

            <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-4">
              <p className="text-sm font-medium text-blue-300">
                거의 다 됐어요
              </p>

              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                이 정보는 앞으로
                운동·식단·체성분 기록과
                함께 체성분 변화 예측을
                개인화하는 데 활용됩니다.
              </p>
            </div>
          </section>
        )}

        {error && (
          <p className="mt-5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-3 py-2.5 text-center leading-relaxed">
            {error}
          </p>
        )}
      </main>

      {/* Footer */}
      <div className="sticky bottom-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-900 px-4 py-4">
        {step <
        TOTAL_STEPS - 1 ? (
          <button
            type="button"
            onClick={
              nextStep
            }
            disabled={
              !canContinue() ||
              isSaving
            }
            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors ${
              canContinue() &&
              !isSaving
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            다음

            <ArrowRight
              size={18}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={
              !canContinue() ||
              isSaving
            }
            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors ${
              canContinue() &&
              !isSaving
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2
                  size={18}
                  className="animate-spin"
                />

                저장 중...
              </>
            ) : (
              <>
                시작하기

                <Check
                  size={18}
                />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}