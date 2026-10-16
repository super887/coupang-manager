import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import StatsClientWrapper from '@/components/StatsClientWrapper';

export const maxDuration = 60;

export default async function StatsPage() {
  // DB 통신을 제거하고, 세션 검사만 진행하여 딜레이 0초 달성
  const session = await verifySession();
  if (!session?.userId) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12">
      {/* ✨ 헤더 활성화 상태를 stats로 넘겨줌 */}
      <Header active="stats" />

      <main className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* 🚀 모든 렌더링과 계산은 캐싱 기능이 내장된 클라이언트 래퍼가 담당 */}
        <StatsClientWrapper />

      </main>
    </div>
  );
}