import Link from 'next/link';

import {
  CircleAlert,
  Dumbbell,
} from 'lucide-react';

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Dumbbell
              size={30}
              className="text-white"
            />
          </div>
        </div>

        <div className="flex justify-center mb-5">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <CircleAlert
              size={24}
              className="text-red-400"
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold">
          이메일 인증에 실패했습니다
        </h1>

        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
          인증 링크가 만료되었거나
          이미 사용된 링크일 수 있습니다.
          다시 로그인하거나 회원가입을
          진행해주세요.
        </p>

        <div className="space-y-3 mt-8">
          <Link
            href="/login"
            className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            로그인으로 이동
          </Link>

          <Link
            href="/signup"
            className="block w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium py-3.5 rounded-xl transition-colors"
          >
            다시 회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}