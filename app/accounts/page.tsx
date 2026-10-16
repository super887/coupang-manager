import { Suspense } from 'react';
import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import AccountsClientWrapper from '@/components/AccountsClientWrapper'; // ✨ 방금 만든 마법의 래퍼!

export const maxDuration = 60;

export default async function AccountsPage() {
  // DB에서 무거운 데이터를 가져오는 코드는 다 빼버렸습니다! (가벼운 세션 검사만 진행)
  const session = await verifySession();
  if (!session?.userId) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header active="accounts"/>

      <main className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<div className="flex justify-center p-10 text-gray-500">화면 구성 중...</div>}>
          
          {/* 🚀 모든 데이터 렌더링은 클라이언트 래퍼에 맡겨서 화면 전환을 0초로 만듭니다! */}
          <AccountsClientWrapper />

        </Suspense>
      </main>
    </div>
  );
}