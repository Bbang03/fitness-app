import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const tokenHash =
    searchParams.get('token_hash');

  const type =
    searchParams.get('type') as EmailOtpType | null;

  const redirectTo =
    request.nextUrl.clone();

  // 인증 토큰이 URL에 남지 않도록 제거
  redirectTo.search = '';

  if (tokenHash && type) {
    const supabase =
      await createClient();

    /*
     * 이메일 인증 처리
     *
     * token_hash를 검증하면 Supabase에서
     * 이메일 인증이 완료되고 인증 세션이 생성된다.
     */
    const { error: verifyError } =
      await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });

    if (!verifyError) {
      /*
       * FitTrack 인증 정책:
       *
       * 이메일 인증 완료와 실제 로그인을 분리한다.
       *
       * verifyOtp() 성공 직후 생성된 세션을 제거해서
       * 사용자가 이메일 + 비밀번호로 직접 로그인하도록 한다.
       */
      const { error: signOutError } =
        await supabase.auth.signOut({
          scope: 'local',
        });

      if (signOutError) {
        console.error(
          'Post-verification sign out failed:',
          signOutError.message,
        );

        redirectTo.pathname =
          '/auth/auth-code-error';

        return NextResponse.redirect(
          redirectTo,
        );
      }

      /*
       * 이메일 인증 성공
       *
       * confirmed=1은 로그인 페이지에서
       * "이메일 인증이 완료되었습니다."
       * 메시지를 표시하기 위해 사용한다.
       */
      redirectTo.pathname =
        '/login';

      redirectTo.searchParams.set(
        'confirmed',
        '1',
      );

      return NextResponse.redirect(
        redirectTo,
      );
    }

    console.error(
      'Email verification failed:',
      verifyError.message,
    );
  }

  /*
   * token_hash/type이 없거나
   * 인증 링크가 잘못됐거나 만료된 경우
   */
  redirectTo.pathname =
    '/auth/auth-code-error';

  return NextResponse.redirect(
    redirectTo,
  );
}