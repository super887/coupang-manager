'use client';

import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth';



export default function LoginPage() {
  // [확장성 포인트]: React 19의 useActionState를 활용해 폼 상태와 로딩, 에러 관리를 깔끔하게 처리
  const [state, action, isPending] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">쿠팡 리뷰 매니저</h1>
          <p className="text-gray-500 mt-2 text-sm">이름과 전화번호로 간편하게 시작하세요</p>
        </div>

        <form action={action} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">이름</label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="홍길동"
              className="mt-1 block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">전화번호</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              required
              placeholder="010-1234-5678"
              className="mt-1 block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* 에러 메시지 출력 영역 */}
          {state?.error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? '로그인 처리 중...' : '로그인 및 시작하기'}
          </button>
        </form>
      </div>
    </div>
  );
}