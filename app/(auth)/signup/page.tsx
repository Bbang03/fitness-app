'use client';

import {
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import {
  Check,
  ChevronLeft,
  Dumbbell,
  Loader2,
  MailCheck,
  X,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

import type {
  Sex,
} from '@/lib/types';

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
  const [step, setStep] =
    useState<1 | 2>(1);

  const [form, setForm] =
    useState({
      email: '',
      password: '',
      name: '',
      height_cm: '170',
      sex: 'male' as Sex,
      birth_year: String(
        new Date().getFullYear() -
          25,
      ),
    });

  const [error, setError] =
    useState('');

  const [
    emailStatus,
    setEmailStatus,
  ] =
    useState<EmailStatus>(
      'idle',
    );

  const [
    emailMessage,
    setEmailMessage,
  ] =
    useState('');

  const [
    verifiedEmail,
    setVerifiedEmail,
  ] =
    useState('');

  const [
    isSubmitting,
    setIsSubmitting,
  ] =
    useState(false);

  const [
    signupComplete,
    setSignupComplete,
  ] =
    useState(false);

  const [
    signupEmail,
    setSignupEmail,
  ] =
    useState('');

  const normalizedEmail =
    form.email
      .trim()
      .toLowerCase();

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
    }

    if (error) {
      setError('');
    }
  };

  // ─────────────────────────────────────────────
  // 이메일 도메인 검증
  // ─────────────────────────────────────────────

  const validateEmailDomain =
    async (): Promise<boolean> => {
      if (!normalizedEmail) {
        setEmailStatus(
          'invalid',
        );

        setEmailMessage(
          '이메일을 입력해주세요.',
        );

        return false;
      }

      if (
        !isEmailFormatValid
      ) {
        setEmailStatus(
          'invalid',
        );

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

      setEmailStatus(
        'checking',
      );

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

              body:
                JSON.stringify({
                  email:
                    normalizedEmail,
                }),
            },
          );

        const result =
          (await response.json()) as EmailValidationResult;

        if (!result.valid) {
          setVerifiedEmail('');

          setEmailStatus(
            'invalid',
          );

          setEmailMessage(
            result.message ??
              '이메일 주소를 다시 확인해주세요.',
          );

          return false;
        }

        setVerifiedEmail(
          normalizedEmail,
        );

        setEmailStatus(
          'valid',
        );

        setEmailMessage(
          '이메일을 받을 수 있는 도메인입니다.',
        );

        return true;
      } catch (
        validationError
      ) {
        console.error(
          'Email validation failed:',
          validationError,
        );

        setVerifiedEmail('');

        setEmailStatus(
          'invalid',
        );

        setEmailMessage(
          '이메일 주소를 확인하는 중 문제가 발생했습니다.',
        );

        return false;
      }
    };

  // ─────────────────────────────────────────────
  // Step 1
  // ─────────────────────────────────────────────

  const handleStep1 =
    async (
      e: React.FormEvent,
    ) => {
      e.preventDefault();

      if (
        !form.name.trim()
      ) {
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

      if (
        !isPasswordValid
      ) {
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

  // ─────────────────────────────────────────────
  // 회원가입
  // ─────────────────────────────────────────────

  const handleSubmit =
    async (
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

      if (
        !isPasswordValid
      ) {
        setError(
          '비밀번호 조건을 모두 충족해주세요.',
        );

        setStep(1);
        return;
      }

      const height =
        Number(
          form.height_cm,
        );

      const birthYear =
        Number(
          form.birth_year,
        );

      const currentYear =
        new Date()
          .getFullYear();

      if (
        !Number.isFinite(
          height,
        ) ||
        height < 100 ||
        height > 250
      ) {
        setError(
          '키를 올바르게 입력해주세요.',
        );

        return;
      }

      if (
        !Number.isFinite(
          birthYear,
        ) ||
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

      try {
        /*
         * 이전 테스트 계정이나 다른 사용자의
         * Supabase 세션이 브라우저에 남아 있는 경우
         * 새 회원가입 흐름과 섞이지 않도록
         * local session을 먼저 정리한다.
         */
        const {
          error:
            signOutError,
        } =
          await supabase.auth.signOut({
            scope: 'local',
          });

        if (signOutError) {
          console.warn(
            'Previous local session cleanup failed:',
            signOutError.message,
          );
        }

        /*
         * 이메일 인증이 활성화되어 있다면
         * 가입 직후 session은 null이어야 한다.
         *
         * 인증 메일의 링크가 현재 실행 중인 앱의
         * /auth/confirm 엔드포인트로 돌아오도록 한다.
         *
         * Supabase Confirm signup 이메일 템플릿에서는
         * {{ .RedirectTo }}에 token_hash/type을 붙여
         * 이 엔드포인트를 호출하도록 설정한다.
         */
        const {
          data,
          error:
            signupError,
        } =
          await supabase.auth.signUp({
            email:
              normalizedEmail,

            password:
              form.password,

            options: {
              emailRedirectTo:
                `${window.location.origin}/auth/confirm`,

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

          return;
        }

        if (!data.user) {
          setError(
            '회원가입 처리 중 사용자 정보를 생성하지 못했습니다.',
          );

          return;
        }

        /*
         * 중요:
         *
         * FitTrack은 이메일 인증 완료 전에는
         * 로그인 세션을 허용하지 않는다.
         *
         * 따라서 가입 직후 session이 존재하면
         * Supabase Auth에서 이메일 인증이
         * 비활성화되어 있다는 의미로 처리한다.
         */
        if (data.session) {
          console.error(
            'Unexpected signup session: email confirmation appears to be disabled.',
          );

          await supabase.auth.signOut({
            scope: 'local',
          });

          setError(
            '이메일 인증 절차가 정상적으로 시작되지 않았습니다. Supabase Auth 이메일 인증 설정을 확인해주세요.',
          );

          return;
        }

        /*
         * 이메일 인증이 정상적으로 필요한 경우
         *
         * data.user    -> 존재
         * data.session -> null
         *
         * 여기서는 로그인/온보딩으로
         * 자동 이동하지 않는다.
         */
        setSignupEmail(
          normalizedEmail,
        );

        setSignupComplete(
          true,
        );

        // 비밀번호는 화면 상태에서도 제거
        setForm(
          (prev) => ({
            ...prev,
            password: '',
          }),
        );
      } catch (
        signupException
      ) {
        console.error(
          'Signup exception:',
          signupException,
        );

        setError(
          '회원가입 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        );
      } finally {
        setIsSubmitting(
          false,
        );
      }
    };

  // ─────────────────────────────────────────────
  // 이메일 인증 대기 화면
  // ─────────────────────────────────────────────

  if (signupComplete) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 py-12">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Dumbbell
                size={30}
                className="text-white"
              />
            </div>
          </div>

          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <MailCheck
                size={28}
                className="text-emerald-400"
              />
            </div>
          </div>

          <p className="text-sm font-medium text-emerald-400 mb-2">
            회원가입 완료
          </p>

          <h1 className="text-2xl font-bold">
            인증 메일을
            <br />
            확인해주세요
          </h1>

          <p className="text-sm text-zinc-400 mt-4 leading-relaxed">
            아래 이메일 주소로
            인증 메일을 전송했습니다.
          </p>

          <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
            <p className="text-xs text-zinc-500">
              인증 이메일
            </p>

            <p className="text-sm font-medium text-zinc-200 mt-1 break-all">
              {signupEmail}
            </p>
          </div>

          <div className="mt-5 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-4 text-left">
            <p className="text-sm font-medium text-blue-300">
              다음 단계
            </p>

            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              1. 받은 편지함에서
              Supabase 인증 메일을
              확인해주세요.
            </p>

            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              2. 이메일 인증 링크를
              눌러 인증을 완료해주세요.
            </p>

            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              3. 인증 후 FitTrack에
              로그인하면 온보딩 설문이
              시작됩니다.
            </p>
          </div>

          <p className="text-xs text-zinc-600 mt-4 leading-relaxed">
            메일이 보이지 않는다면
            스팸 또는 정크 메일함도
            확인해주세요.
          </p>

          <div className="space-y-3 mt-8">
            <Link
              href="/login"
              className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors"
            >
              인증 후 로그인
            </Link>

            <Link
              href="/"
              className="block w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-medium py-3.5 rounded-xl transition-colors"
            >
              홈으로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // 회원가입 Form
  // ─────────────────────────────────────────────

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
        <div className="h-1 flex-1 rounded-full bg-blue-500" />

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
              value={
                form.name
              }
              onChange={(e) =>
                update(
                  'name',
                  e.target.value,
                )
              }
              disabled={
                isSubmitting
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
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
              value={
                form.email
              }
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
              disabled={
                isSubmitting
              }
              className={`w-full bg-zinc-900 border rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors disabled:opacity-50 ${
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
              value={
                form.password
              }
              onChange={(e) =>
                update(
                  'password',
                  e.target.value,
                )
              }
              disabled={
                isSubmitting
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
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
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg py-2.5 px-3 leading-relaxed">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              emailStatus ===
                'checking' ||
              isSubmitting
            }
            className={`w-full font-semibold py-3.5 rounded-xl transition-colors mt-2 flex items-center justify-center gap-2 ${
              emailStatus ===
                'checking' ||
              isSubmitting
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
              className="text-blue-400 font-medium hover:text-blue-300"
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
                if (
                  isSubmitting
                ) {
                  return;
                }

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
              ).map(
                (
                  sex,
                ) => (
                  <button
                    key={
                      sex
                    }
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
                    className={`py-3 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${
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
                ),
              )}
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
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
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
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              min={1940}
              max={
                new Date()
                  .getFullYear() -
                10
              }
              required
            />
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              가입 후 먼저 이메일
              인증을 진행합니다.
              인증이 완료된 사용자는
              로그인 후 운동 경험,
              활동량, 수면, 목표와
              식습관을 묻는 짧은
              설문을 진행합니다.
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg py-2.5 px-3 leading-relaxed">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting
            }
            className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${
              isSubmitting
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2
                  size={17}
                  className="animate-spin"
                />

                가입 중...
              </>
            ) : (
              '회원가입'
            )}
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
          <Check
            size={10}
          />
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
    ) ||
    normalized.includes(
      'user already registered',
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
    ) ||
    normalized.includes(
      'too many requests',
    )
  ) {
    return '회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }

  return '회원가입에 실패했습니다. 입력한 정보를 확인한 뒤 다시 시도해주세요.';
}