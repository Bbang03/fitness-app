'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Check,
  ChevronLeft,
  Dumbbell,
  Loader2,
  X,
} from 'lucide-react';

import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';

import type { Sex } from '@/lib/types';

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PASSWORD_MIN_LENGTH = 8;

type EmailStatus =
  | 'idle'
  | 'checking'
  | 'valid'
  | 'invalid';

type EmailValidationResult = {
  valid: boolean;
  reason?: string;
  message?: string;
};

export default function SignupPage() {
  const router = useRouter();

  const { currentUser } = useStore();

  const [step, setStep] =
    useState<1 | 2>(1);

  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    height_cm: '170',
    sex: 'male' as Sex,
    birth_year: String(
      new Date().getFullYear() - 25,
    ),
  });

  const [error, setError] =
    useState('');

  const [
    emailStatus,
    setEmailStatus,
  ] = useState<EmailStatus>('idle');

  const [
    emailMessage,
    setEmailMessage,
  ] = useState('');

  const [
    verifiedEmail,
    setVerifiedEmail,
  ] = useState('');

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  useEffect(() => {
    if (currentUser()) {
      router.replace('/dashboard');
    }
  }, [currentUser, router]);

  const normalizedEmail =
    form.email.trim().toLowerCase();

  const isEmailFormatValid =
    useMemo(
      () =>
        EMAIL_REGEX.test(
          normalizedEmail,
        ),
      [normalizedEmail],
    );

  const passwordChecks =
    useMemo(
      () => ({
        length:
          form.password.length >=
          PASSWORD_MIN_LENGTH,

        uppercase:
          /[A-Z]/.test(
            form.password,
          ),

        number:
          /[0-9]/.test(
            form.password,
          ),

        special:
          /[^A-Za-z0-9]/.test(
            form.password,
          ),
      }),
      [form.password],
    );

  const isPasswordValid =
    passwordChecks.length &&
    passwordChecks.uppercase &&
    passwordChecks.number &&
    passwordChecks.special;

  const update = (
    field: string,
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (field === 'email') {
      setVerifiedEmail('');
      setEmailStatus('idle');
      setEmailMessage('');
      setError('');
    }
  };

  // ── 이메일 도메인 검증 ─────────────────────────────────────────────

  const validateEmailDomain =
    async (): Promise<boolean> => {
      if (!normalizedEmail) {
        setEmailStatus('invalid');
        setEmailMessage(
          '이메일을 입력해주세요.',
        );

        return false;
      }

      if (!isEmailFormatValid) {
        setEmailStatus('invalid');
        setEmailMessage(
          '올바른 이메일 형식이 아닙니다.',
        );

        return false;
      }

      if (
        verifiedEmail ===
          normalizedEmail &&
        emailStatus === 'valid'
      ) {
        return true;
      }

      setEmailStatus('checking');
      setEmailMessage(
        '이메일 도메인을 확인하고 있습니다.',
      );

      try {
        const response =
          await fetch(
            '/api/auth/validate-email',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                email:
                  normalizedEmail,
              }),
            },
          );

        const result =
          (await response.json()) as EmailValidationResult;

        if (!result.valid) {
          setVerifiedEmail('');
          setEmailStatus('invalid');

          setEmailMessage(
            result.message ??
              '이메일 주소를 다시 확인해주세요.',
          );

          return false;
        }

        setVerifiedEmail(
          normalizedEmail,
        );

        setEmailStatus('valid');

        setEmailMessage(
          '이메일을 받을 수 있는 도메인입니다.',
        );

        return true;
      } catch (validationError) {
        console.error(
          'Email validation failed:',
          validationError,
        );

        setVerifiedEmail('');
        setEmailStatus('invalid');

        setEmailMessage(
          '이메일 주소를 확인하는 중 문제가 발생했습니다.',
        );

        return false;
      }
    };

  // ── Step 1 ─────────────────────────────────────────────────────────

  const handleStep1 = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError(
        '이름을 입력해주세요.',
      );
      return;
    }

    if (!form.password) {
      setError(
        '비밀번호를 입력해주세요.',
      );
      return;
    }

    if (!isPasswordValid) {
      setError(
        '비밀번호 조건을 모두 충족해주세요.',
      );
      return;
    }

    setError('');

    const emailIsValid =
      await validateEmailDomain();

    if (!emailIsValid) {
      return;
    }

    setStep(2);
  };

  // ── 회원가입 ───────────────────────────────────────────────────────

  const handleSubmit = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    const emailIsValid =
      await validateEmailDomain();

    if (!emailIsValid) {
      setStep(1);
      return;
    }

    if (!isPasswordValid) {
      setError(
        '비밀번호 조건을 모두 충족해주세요.',
      );

      setStep(1);
      return;
    }

    const height =
      Number(form.height_cm);

    const birthYear =
      Number(form.birth_year);

    const currentYear =
      new Date().getFullYear();

    if (
      !Number.isFinite(height) ||
      height < 100 ||
      height > 250
    ) {
      setError(
        '키를 올바르게 입력해주세요.',
      );
      return;
    }

    if (
      !Number.isFinite(birthYear) ||
      birthYear < 1940 ||
      birthYear >
        currentYear - 10
    ) {
      setError(
        '출생 연도를 올바르게 입력해주세요.',
      );
      return;
    }

    setError('');
    setIsSubmitting(true);

    const supabase =
      createClient();

    const {
      data,
      error: signupError,
    } =
      await supabase.auth.signUp({
        email: normalizedEmail,
        password: form.password,

        options: {
          data: {
            name:
              form.name.trim(),

            height_cm:
              height,

            sex:
              form.sex,

            birth_year:
              birthYear,
          },
        },
      });

    if (signupError) {
      console.error(
        'Signup failed:',
        signupError.message,
      );

      setError(
        getSignupErrorMessage(
          signupError.message,
        ),
      );

      setIsSubmitting(false);
      return;
    }

    if (!data.user) {
      setError(
        '회원가입에 실패했습니다.',
      );

      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.replace(
        '/onboarding',
      );
      return;
    }

    alert(
      '회원가입이 완료되었습니다.\n가입한 이메일로 전송된 인증 메일을 확인해주세요.',
    );

    router.replace('/login');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Dumbbell
              size={30}
              className="text-white"
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold">
          회원가입
        </h1>

        <p className="text-zinc-400 mt-1 text-sm">
          FitTrack과 함께 시작하세요
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div
          className="h-1 flex-1 rounded-full bg-blue-500"
        />

        <div
          className={`h-1 flex-1 rounded-full ${
            step === 2
              ? 'bg-blue-500'
              : 'bg-zinc-700'
          }`}
        />
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <form
          onSubmit={
            handleStep1
          }
          className="space-y-4"
        >
          <p className="text-sm text-zinc-400 -mt-2 mb-4">
            기본 정보 입력
          </p>

          {/* 이름 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              이름
            </label>

            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                update(
                  'name',
                  e.target.value,
                )
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="홍길동"
              autoComplete="name"
              required
            />
          </div>

          {/* 이메일 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              이메일
            </label>

            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                update(
                  'email',
                  e.target.value,
                )
              }
              onBlur={() => {
                if (
                  normalizedEmail
                ) {
                  void validateEmailDomain();
                }
              }}
              className={`w-full bg-zinc-900 border rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors ${
                emailStatus ===
                'invalid'
                  ? 'border-red-500 focus:border-red-500'
                  : emailStatus ===
                      'valid'
                    ? 'border-emerald-500 focus:border-emerald-500'
                    : 'border-zinc-700 focus:border-blue-500'
              }`}
              placeholder="your@email.com"
              autoComplete="email"
              required
            />

            {emailStatus !==
              'idle' && (
              <div className="flex items-start gap-1.5 mt-2">
                {emailStatus ===
                  'checking' && (
                  <Loader2
                    size={14}
                    className="text-blue-400 animate-spin mt-0.5 flex-shrink-0"
                  />
                )}

                {emailStatus ===
                  'valid' && (
                  <Check
                    size={14}
                    className="text-emerald-400 mt-0.5 flex-shrink-0"
                  />
                )}

                {emailStatus ===
                  'invalid' && (
                  <X
                    size={14}
                    className="text-red-400 mt-0.5 flex-shrink-0"
                  />
                )}

                <span
                  className={`text-xs ${
                    emailStatus ===
                    'valid'
                      ? 'text-emerald-400'
                      : emailStatus ===
                          'invalid'
                        ? 'text-red-400'
                        : 'text-blue-400'
                  }`}
                >
                  {emailMessage}
                </span>
              </div>
            )}
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              비밀번호
            </label>

            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                update(
                  'password',
                  e.target.value,
                )
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <PasswordRule
                valid={
                  passwordChecks.length
                }
                text="8자 이상"
              />

              <PasswordRule
                valid={
                  passwordChecks.uppercase
                }
                text="대문자 1개"
              />

              <PasswordRule
                valid={
                  passwordChecks.number
                }
                text="숫자 1개"
              />

              <PasswordRule
                valid={
                  passwordChecks.special
                }
                text="특수문자 1개"
              />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg py-2 px-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              emailStatus ===
              'checking'
            }
            className={`w-full font-semibold py-3.5 rounded-xl transition-colors mt-2 flex items-center justify-center gap-2 ${
              emailStatus ===
              'checking'
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white'
            }`}
          >
            {emailStatus ===
            'checking' ? (
              <>
                <Loader2
                  size={17}
                  className="animate-spin"
                />
                이메일 확인 중...
              </>
            ) : (
              '다음'
            )}
          </button>

          <p className="text-center text-zinc-500 text-sm pt-2">
            이미 계정이 있으신가요?{' '}

            <Link
              href="/login"
              className="text-blue-400 font-medium"
            >
              로그인
            </Link>
          </p>
        </form>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <form
          onSubmit={
            handleSubmit
          }
          className="space-y-4"
        >
          <div className="flex items-center gap-2 -mt-2 mb-4">
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep(1);
              }}
              disabled={
                isSubmitting
              }
              className="text-zinc-400 hover:text-white disabled:opacity-50"
            >
              <ChevronLeft
                size={20}
              />
            </button>

            <p className="text-sm text-zinc-400">
              신체 정보 입력
              (예측 모델에 사용)
            </p>
          </div>

          {/* 성별 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
              성별
            </label>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  'male',
                  'female',
                ] as Sex[]
              ).map((sex) => (
                <button
                  key={sex}
                  type="button"
                  disabled={
                    isSubmitting
                  }
                  onClick={() =>
                    update(
                      'sex',
                      sex,
                    )
                  }
                  className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                    form.sex ===
                    sex
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {sex ===
                  'male'
                    ? '남성'
                    : '여성'}
                </button>
              ))}
            </div>
          </div>

          {/* 키 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              키 (cm)
            </label>

            <input
              type="number"
              value={
                form.height_cm
              }
              onChange={(e) =>
                update(
                  'height_cm',
                  e.target.value,
                )
              }
              disabled={
                isSubmitting
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-blue-500"
              min={100}
              max={250}
              required
            />
          </div>

          {/* 출생 연도 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              출생 연도
            </label>

            <input
              type="number"
              value={
                form.birth_year
              }
              onChange={(e) =>
                update(
                  'birth_year',
                  e.target.value,
                )
              }
              disabled={
                isSubmitting
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-blue-500"
              min={1940}
              max={
                new Date().getFullYear() -
                10
              }
              required
            />
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              가입 후 운동 경험, 활동량,
              수면, 목표와 식습관을 묻는
              짧은 설문이 이어집니다.
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg py-2 px-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting
            }
            className={`w-full py-3.5 rounded-xl font-semibold ${
              isSubmitting
                ? 'bg-zinc-800 text-zinc-500'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isSubmitting
              ? '가입 중...'
              : '가입하고 설문 시작'}
          </button>
        </form>
      )}
    </div>
  );
}

function PasswordRule({
  valid,
  text,
}: {
  valid: boolean;
  text: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${
        valid
          ? 'text-emerald-400'
          : 'text-zinc-500'
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center ${
          valid
            ? 'bg-emerald-500/15'
            : 'bg-zinc-800'
        }`}
      >
        {valid ? (
          <Check size={10} />
        ) : (
          <div className="w-1 h-1 bg-zinc-600 rounded-full" />
        )}
      </div>

      {text}
    </div>
  );
}

function getSignupErrorMessage(
  message: string,
) {
  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      'already registered',
    ) ||
    normalized.includes(
      'already been registered',
    )
  ) {
    return '이미 가입된 이메일입니다.';
  }

  if (
    normalized.includes(
      'invalid email',
    )
  ) {
    return '올바른 이메일 주소를 입력해주세요.';
  }

  if (
    normalized.includes(
      'password',
    )
  ) {
    return '비밀번호 조건을 확인해주세요.';
  }

  if (
    normalized.includes(
      'rate limit',
    )
  ) {
    return '잠시 후 다시 시도해주세요.';
  }

  return message;
}