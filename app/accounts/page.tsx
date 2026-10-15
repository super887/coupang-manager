import { Suspense } from 'react';
import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getAccounts, getSellers } from '@/app/actions/info';

// 클라이언트 컴포넌트들 (Step 3에서 만들 예정)
import AccountManager from '@/components/AccountManager';
import SellerManager from '@/components/SellerManager';

import Header from '@/components/Header';

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
      <Header active="accounts"/>

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