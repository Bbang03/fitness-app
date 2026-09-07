'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';

import {
  Dumbbell,
  Loader2,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  const {
    loginAsGuest,
    syncAuthenticatedUser,
  } = useStore();

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [checkingSession, setCheckingSession] =
    useState(true);

  const [emailConfirmed, setEmailConfirmed] =
    useState(false);

  // ── 이미 Supabase 로그인된 사용자 처리 ───────────────────────────────

  useEffect(() => {
    const checkExistingSession = async () => {
      const supabase =
        createClient();

      /*
       * 이메일 인증 완료 후 /login?confirmed=1 로 들어온 경우
       * 인증 과정에서 남아 있을 수 있는 로컬 세션을 한 번 더 정리한다.
       *
       * FitTrack은 이메일 인증과 실제 로그인을 분리하므로,
       * 이 경우에는 자동으로 dashboard/onboarding으로 보내지 않고
       * 반드시 로그인 폼을 보여준다.
       */
      const confirmed =
        new URLSearchParams(
          window.location.search,
        ).get('confirmed') === '1';

      if (confirmed) {
        setEmailConfirmed(true);

        const { error: signOutError } =
          await supabase.auth.signOut({
            scope: 'local',
          });

        if (signOutError) {
          console.warn(
            'Post-confirmation local session cleanup failed:',
            signOutError.message,
          );
        }

        setCheckingSession(false);
        return;
      }

      try {
        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          setCheckingSession(false);
          return;
        }

        const {
          data: predictionProfile,
          error: predictionError,
        } =
          await supabase
            .from('prediction_profiles')
            .select('user_id')
            .eq(
              'user_id',
              user.id,
            )
            .maybeSingle();

        if (predictionError) {
          console.error(
            'Prediction profile check failed:',
            predictionError.message,
          );

          setCheckingSession(false);
          return;
        }

        if (predictionProfile) {
          router.replace(
            '/dashboard',
          );
        } else {
          router.replace(
            '/onboarding',
          );
        }
      } catch (sessionError) {
        console.error(
          'Session check failed:',
          sessionError,
        );

        setCheckingSession(false);
      }
    };

    void checkExistingSession();
  }, [router]);

  // ── 로그인 ───────────────────────────────────────────────────────────

  const handleSubmit = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (loading) return;

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError(
        '이메일을 입력해주세요.',
      );
      return;
    }

    if (!password) {
      setError(
        '비밀번호를 입력해주세요.',
      );
      return;
    }

    setError('');
    setLoading(true);

    const supabase =
      createClient();

    try {
      // 1. Supabase Auth 로그인
      const {
        data,
        error: loginError,
      } =
        await supabase.auth.signInWithPassword({
          email:
            normalizedEmail,

          password,
        });

      if (
        loginError ||
        !data.user
      ) {
        setError(
          getLoginErrorMessage(
            loginError?.message ??
              '',
          ),
        );

        return;
      }

      // 이메일 인증이 필요한 프로젝트에서
      // 혹시라도 미인증 사용자가 세션을 얻는 예외 상황 방지
      if (
        !data.user.email_confirmed_at
      ) {
        await supabase.auth.signOut({
          scope: 'local',
        });

        setError(
          '이메일 인증이 완료되지 않았습니다. 받은 편지함에서 인증 메일을 확인해주세요.',
        );

        return;
      }

      // 2. 기본 프로필 + 온보딩 완료 여부 동시 조회
      const [
        profileResult,
        predictionResult,
      ] =
        await Promise.all([
          supabase
            .from('profiles')
            .select(
              `
                id,
                name,
                height_cm,
                sex,
                birth_year,
                created_at
              `,
            )
            .eq(
              'id',
              data.user.id,
            )
            .single(),

          supabase
            .from(
              'prediction_profiles',
            )
            .select('user_id')
            .eq(
              'user_id',
              data.user.id,
            )
            .maybeSingle(),
        ]);

      const {
        data: profile,
        error: profileError,
      } =
        profileResult;

      const {
        data: predictionProfile,
        error: predictionError,
      } =
        predictionResult;

      // 3. profiles가 없으면 로그인 상태 정리
      if (
        profileError ||
        !profile
      ) {
        console.error(
          'Profile fetch failed:',
          profileError?.message,
        );

        await supabase.auth.signOut({
          scope: 'local',
        });

        setError(
          '사용자 프로필 정보를 불러오지 못했습니다.',
        );

        return;
      }

      // 4. 온보딩 상태 조회 자체가 실패하면
      // 잘못된 화면으로 보내지 않고 로그인 중단
      if (predictionError) {
        console.error(
          'Prediction profile fetch failed:',
          predictionError.message,
        );

        await supabase.auth.signOut({
          scope: 'local',
        });

        setError(
          '온보딩 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
        );

        return;
      }

      // 5. Zustand에 인증 사용자 동기화
      syncAuthenticatedUser({
        id:
          data.user.id,

        email:
          data.user.email ??
          normalizedEmail,

        password: '',

        name:
          profile.name,

        height_cm:
          profile.height_cm,

        sex:
          profile.sex,

        birth_year:
          profile.birth_year,

        created_at:
          profile.created_at,

        is_guest: false,
      });

      // 6. 온보딩 완료 여부에 따라 이동
      if (predictionProfile) {
        router.replace(
          '/dashboard',
        );
      } else {
        router.replace(
          '/onboarding',
        );
      }
    } catch (loginException) {
      console.error(
        'Login failed:',
        loginException,
      );

      setError(
        '로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Guest ────────────────────────────────────────────────────────────

  const handleGuestLogin = () => {
    if (loading) return;

    loginAsGuest();

    router.push(
      '/dashboard',
    );
  };

  // 기존 Supabase 세션 확인 중
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            size={24}
            className="text-blue-400 animate-spin"
          />

          <p className="text-sm text-zinc-500">
            로그인 상태를 확인하는 중...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Dumbbell
              size={30}
              className="text-white"
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">
          FitTrack
        </h1>

        <p className="text-zinc-400 mt-1 text-sm">
          운동을 기록하고 성장하세요
        </p>
      </div>

      <form
        onSubmit={
          handleSubmit
        }
        className="space-y-4"
      >
        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
            이메일
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(
                e.target.value,
              );

              if (error) {
                setError('');
              }
            }}
            disabled={loading}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
            placeholder="your@email.com"
            autoComplete="email"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
            비밀번호
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(
                e.target.value,
              );

              if (error) {
                setError('');
              }
            }}
            disabled={loading}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {/* Email confirmation success */}
        {emailConfirmed && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-emerald-300 text-center">
              이메일 인증이 완료되었습니다.
            </p>

            <p className="text-xs text-zinc-400 text-center mt-1 leading-relaxed">
              가입한 이메일과 비밀번호로 로그인해주세요.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-900/30 rounded-lg py-2.5 px-3 leading-relaxed">
            {error}
          </p>
        )}

        {/* Login */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full font-semibold py-3.5 rounded-xl transition-colors mt-2 flex items-center justify-center gap-2 ${
            loading
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white'
          }`}
        >
          {loading ? (
            <>
              <Loader2
                size={17}
                className="animate-spin"
              />

              로그인 중...
            </>
          ) : (
            '로그인'
          )}
        </button>

        {/* Signup */}
        <p className="text-center text-zinc-500 text-sm pt-2">
          계정이 없으신가요?{' '}

          <Link
            href="/signup"
            className="text-blue-400 font-medium hover:text-blue-300"
          >
            회원가입
          </Link>
        </p>

        {/* Divider */}
        <div className="relative flex items-center py-2">
          <div className="flex-1 border-t border-zinc-800" />

          <span className="px-3 text-xs text-zinc-600">
            또는
          </span>

          <div className="flex-1 border-t border-zinc-800" />
        </div>

        {/* Guest */}
        <button
          type="button"
          onClick={
            handleGuestLogin
          }
          disabled={loading}
          className="w-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-300 font-medium py-3.5 rounded-xl transition-colors disabled:opacity-50"
        >
          비회원으로 시작
        </button>
      </form>
    </div>
  );
}

// ── Supabase 로그인 오류 메시지 변환 ─────────────────────────────────────

function getLoginErrorMessage(
  message: string,
) {
  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      'email not confirmed',
    )
  ) {
    return '이메일 인증이 완료되지 않았습니다. 받은 편지함에서 인증 메일을 확인해주세요.';
  }

  if (
    normalized.includes(
      'invalid login credentials',
    )
  ) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
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
      'rate limit',
    ) ||
    normalized.includes(
      'too many requests',
    )
  ) {
    return '로그인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }

  return '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.';
}