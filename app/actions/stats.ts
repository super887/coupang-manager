'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';

export async function getStatsData() {
  const session = await verifySession();
  if (!session?.userId) return [];

  // ✨ 엑셀 다운로드를 위해 select 제한을 없애고 전체 데이터를 가져옵니다.
  const data = await prisma.purchase.findMany({
    where: { userId: session.userId },
    orderBy: { purchaseDate: 'desc' }, // 최신순 정렬
  });

  return data;
}