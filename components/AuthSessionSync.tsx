'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';

export default function AuthSessionSync({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const syncSession = async () => {
      // Supabase Auth 서버에서 실제 로그인 사용자 확인
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      // Supabase 로그인 세션이 없는 경우
      if (userError || !user) {
        const state = useStore.getState();

        // 비회원 모드는 기존 로컬 방식을 유지
        const localUser = state.users.find(
          (u) => u.id === state.currentUserId,
        );

        if (!localUser?.is_guest) {
          state.logout();
        }

        setReady(true);
        return;
      }

      // 로그인되어 있으면 DB에서 실제 프로필 조회
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, height_cm, sex, birth_year, created_at')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      if (profileError || !profile) {
        console.error(
          'Profile sync failed:',
          profileError?.message,
        );

        useStore.getState().logout();
        setReady(true);
        return;
      }

      // 기존 FitTrack 화면과 호환되도록 Zustand에 동기화
      useStore.getState().syncAuthenticatedUser({
        id: user.id,
        email: user.email ?? '',
        password: '',
        name: profile.name,
        height_cm: profile.height_cm,
        sex: profile.sex,
        birth_year: profile.birth_year,
        created_at: profile.created_at,
        is_guest: false,
      });

      setReady(true);
    };

    void syncSession();

    // 현재 브라우저에서 Supabase 로그아웃이 발생하면
    // Zustand 로그인 상태도 같이 제거
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        const state = useStore.getState();

        const localUser = state.users.find(
          (u) => u.id === state.currentUserId,
        );

        if (!localUser?.is_guest) {
          state.logout();
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // 인증 상태 확인 전에 각 페이지가 잘못 redirect하는 것을 방지
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">
        FitTrack 불러오는 중...
      </div>
    );
  }

  return <>{children}</>;
}