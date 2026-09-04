'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import { Dumbbell } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
const { loginAsGuest, currentUser, syncAuthenticatedUser } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser()) router.replace('/dashboard');
  }, [currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
   e.preventDefault();
   setError('');
   setLoading(true);
 
   try {
     const supabase = createClient();
 
     const { data, error: loginError } =
       await supabase.auth.signInWithPassword({
         email,
         password,
       });
 
     if (loginError || !data.user) {
       setError('이메일 또는 비밀번호가 올바르지 않습니다.');
       return;
     }
 
     const { data: profile, error: profileError } = await supabase
       .from('profiles')
       .select('id, name, height_cm, sex, birth_year, created_at')
       .eq('id', data.user.id)
       .single();
 
     if (profileError || !profile) {
       await supabase.auth.signOut();
       setError('사용자 프로필 정보를 불러오지 못했습니다.');
       return;
     }
 
     syncAuthenticatedUser({
       id: data.user.id,
       email: data.user.email ?? email,
       password: '',
       name: profile.name,
       height_cm: profile.height_cm,
       sex: profile.sex,
       birth_year: profile.birth_year,
       created_at: profile.created_at,
       is_guest: false,
     });
 
     router.push('/dashboard');
   } finally {
     setLoading(false);
   }
 };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Dumbbell size={30} className="text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">FitTrack</h1>
        <p className="text-zinc-400 mt-1 text-sm">운동을 기록하고 성장하세요</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
            이메일
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="your@email.com"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
            비밀번호
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-900/20 rounded-lg py-2 px-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50 mt-2"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>

        <p className="text-center text-zinc-500 text-sm pt-2">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="text-blue-400 font-medium hover:text-blue-300">
            회원가입
          </Link>
        </p>

        <div className="relative flex items-center py-2">
          <div className="flex-1 border-t border-zinc-800" />
          <span className="px-3 text-xs text-zinc-600">또는</span>
          <div className="flex-1 border-t border-zinc-800" />
        </div>

        <button
          type="button"
          onClick={() => { loginAsGuest(); router.push('/dashboard'); }}
          className="w-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-300 font-medium py-3.5 rounded-xl transition-colors"
        >
          비회원으로 시작
        </button>
      </form>
    </div>
  );
}
