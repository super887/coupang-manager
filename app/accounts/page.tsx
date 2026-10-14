import { Suspense } from 'react';
import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getAccounts, getSellers } from '@/app/actions/info';

// 클라이언트 컴포넌트들 (Step 3에서 만들 예정)
import AccountManager from '@/components/AccountManager';
import SellerManager from '@/components/SellerManager';

async function AccountsContent() {
  const session = await verifySession();
  if (!session?.userId) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  });
  if (!user) redirect('/login');

  const accounts = await getAccounts();
  const sellers = await getSellers();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200">
        <div className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="font-bold text-xl tracking-tight text-gray-900">쿠팡 리뷰 매니저</h1>
            <nav className="flex gap-6">
              <Link href="/" className="text-gray-500 hover:text-gray-900 font-medium pb-1 transition-colors">
                대시보드
              </Link>
              <Link href="/accounts" className="text-gray-900 font-semibold border-b-2 border-gray-900 pb-1">
                계정정보관리
              </Link>
            </nav>
          </div>
          <span className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
            {user.name} 님
          </span>
        </div>
      </header>

      {/* 화면을 반으로 나누는 메인 영역 (Grid 사용) */}
      <main className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* 왼쪽: 계정 정보 관리 */}
          <section>
            <AccountManager initialData={accounts} />
          </section>

          {/* 오른쪽: 판매자 정보 관리 */}
          <section>
            <SellerManager initialData={sellers} />
          </section>

        </div>
      </main>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">불러오는 중...</div>}>
      <AccountsContent />
    </Suspense>
  );
}