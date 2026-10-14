import { Suspense } from 'react';
import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import ApiKeyForm from '@/components/ApiKeyForm';
import Link from 'next/link'; 

import PurchaseTable from '@/components/PurchaseTable';

// ✨ Vercel 서버 타임아웃 60초 연장 설정은 페이지 컴포넌트 파일에 배치합니다.
export const maxDuration = 60;

async function DashboardContent() {
  const session = await verifySession();
  if (!session?.userId) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, geminiApiKey: true, customPrompt: true },
  });
  if (!user) redirect('/login');
  
  const hasApiKey = !!user.geminiApiKey;
  
  const accounts = await prisma.accountInfo.findMany({
    where: { userId: session.userId },
    select: { accountHolder: true },
    orderBy: { createdAt: 'asc' }, 
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200">
        <div className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="font-bold text-xl tracking-tight text-gray-900">쿠팡 리뷰 매니저</h1>
            <nav className="flex gap-6">
              <Link href="/" className="text-gray-900 font-semibold border-b-2 border-gray-900 pb-1">
                대시보드
              </Link>
              <Link href="/accounts" className="text-gray-500 hover:text-gray-900 font-medium pb-1 transition-colors">
                계정정보관리
              </Link>
            </nav>
          </div>
          <span className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
            {user.name} 님
          </span>
        </div>
      </header>

      <main className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ✨ 플랫폼 바로가기 영역 */}
        <div className="mb-6 flex gap-4">
          <a
            href="https://www.coupang.com/" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gray-50 border border-gray-100 group-hover:scale-110 transition-transform">
              <img 
                src="data:image/png;base64,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" 
                alt="Coupang" 
                className="w-full h-full object-cover" 
              />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-blue-600 transition-colors">쿠팡 바로가기</span>
          </a>
          
          <a
            href="https://www.naver.com/" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-green-400 hover:shadow-md transition-all group"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gray-50 border border-gray-100 group-hover:scale-110 transition-transform">
              <img 
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcBAMAAACAI8KnAAAAMFBMVEUeyAAAxQAAxADs+ev////6//m467Pi9uHD7r6x6KuC3XgmygrU89CQ4Iin5qHJ8cMfkHdFAAAAYUlEQVR4AWOgKRBSUgIRihAeo4mLKwNjiouzAIRb4uLSxDjFxR3B9RJE4bpsROUeQuX6PkHhunxB4voD+UhcvysoXE8dVK40KldwCQpXQALBNXFxE2AIgXoB6jclIEFLAAD2tiUhfIzieAAAAABJRU5ErkJggg==" 
                alt="Naver" 
                className="w-full h-full object-cover" 
              />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-green-600 transition-colors">네이버 바로가기</span>
          </a>
        </div>

        <ApiKeyForm initialHasKey={hasApiKey} initialPrompt={user.customPrompt} />

        <div className="mt-6">
          <PurchaseTable accounts="{accounts}"/>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">대시보드 불러오는 중...</div>}>
      <DashboardContent />
    </Suspense>
  );
}