'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Dumbbell, ChevronLeft } from 'lucide-react';
import type { Sex } from '@/lib/types';

export default function SignupPage() {
  const router = useRouter();
  const { signup, currentUser } = useStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    height_cm: '170',
    sex: 'male' as Sex,
    birth_year: String(new Date().getFullYear() - 25),
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser()) router.replace('/dashboard');
  }, [currentUser, router]);

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.name) {
      setError('모든 항목을 입력해주세요.');
      return;
    }
    if (form.password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const users = useStore.getState().users;
    if (users.find((u) => u.email.toLowerCase() === form.email.toLowerCase())) {
      setError('이미 사용 중인 이메일입니다.');
      setStep(1);
      return;
    }
    signup({
      email: form.email,
      password: form.password,
      name: form.name,
      height_cm: Number(form.height_cm) || 170,
      sex: form.sex,
      birth_year: Number(form.birth_year) || new Date().getFullYear() - 25,
    });
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Dumbbell size={30} className="text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">회원가입</h1>
        <p className="text-zinc-400 mt-1 text-sm">FitTrack과 함께 시작하세요</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-zinc-700'}`} />
        <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-zinc-700'}`} />
      </div>

      {step === 1 && (
        <form onSubmit={handleStep1} className="space-y-4">
          <p className="text-sm text-zinc-400 -mt-2 mb-4">기본 정보 입력</p>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              이름
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="홍길동"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              이메일
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
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
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 rounded-lg py-2 px-3">{error}</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors mt-2"
          >
            다음
          </button>
          <p className="text-center text-zinc-500 text-sm pt-2">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-blue-400 font-medium">
              로그인
            </Link>
          </p>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 -mt-2 mb-4">
            <button type="button" onClick={() => setStep(1)} className="text-zinc-400 hover:text-white">
              <ChevronLeft size={20} />
            </button>
            <p className="text-sm text-zinc-400">신체 정보 입력 (예측 모델에 사용)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
              성별
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as Sex[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update('sex', s)}
                  className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                    form.sex === s
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {s === 'male' ? '남성' : '여성'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              키 (cm)
            </label>
            <input
              type="number"
              value={form.height_cm}
              onChange={(e) => update('height_cm', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="170"
              min={100}
              max={250}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              출생 연도
            </label>
            <input
              type="number"
              value={form.birth_year}
              onChange={(e) => update('birth_year', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="1995"
              min={1940}
              max={new Date().getFullYear() - 10}
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 rounded-lg py-2 px-3">{error}</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors mt-2"
          >
            가입 완료
          </button>
        </form>
      )}
    </div>
  );
}
