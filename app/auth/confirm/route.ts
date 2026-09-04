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

    const { error } =
      await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });

    if (!error) {
      // 이메일 인증 성공
      redirectTo.pathname =
        '/onboarding';

      return NextResponse.redirect(
        redirectTo,
      );
    }

    console.error(
      'Email verification failed:',
      error.message,
    );
  }

  // 잘못됐거나 만료된 인증 링크
  redirectTo.pathname =
    '/auth/auth-code-error';

  return NextResponse.redirect(
    redirectTo,
  );
}