import { Suspense } from 'react';
import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import ApiKeyForm from '@/components/ApiKeyForm';
import PurchaseTable from '@/components/PurchaseTable';

// ✨ 방금 만든 공통 헤더 부품 불러오기
import Header from '@/components/Header'; 

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
      {/* 🚀 엄청나게 길었던 헤더 코드를 딱 이 한 줄로 압축! */}
      <Header active="dashboard" />

      <main className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
         {/* ... 기존 main 안의 플랫폼 바로가기(a 태그)와 PurchaseTable 부분은 그대로 유지 ... */}
         {/* (코드 생략) */}
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