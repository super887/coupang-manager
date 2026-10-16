import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import DashboardClientWrapper from '@/components/DashboardClientWrapper'; // ✨ 방금 만든 마법의 클라이언트 래퍼!

// ✨ Vercel 서버 타임아웃 60초 연장 설정
export const maxDuration = 60;

export default async function DashboardPage() {
  // DB 통신을 모조리 제거하고, 가벼운 세션 검사만 진행하여 딜레이 0초 달성!
  const session = await verifySession();
  if (!session?.userId) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header active="dashboard" />

      <main className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* 🚀 지긋지긋했던 전체화면 "대시보드 불러오는 중..." Suspense 태그를 영구 삭제! */}
        {/* 대신 껍데기부터 즉시 띄우는 클라이언트 래퍼를 렌더링합니다. */}
        <DashboardClientWrapper />

      </main>
    </div>
  );
}