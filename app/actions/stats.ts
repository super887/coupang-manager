'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';

export async function getStatsData() {
  const session = await verifySession();
  if (!session?.userId) return [];

  // 통계 계산에 필요한 최소한의 데이터만 빠르게 가져옵니다.
  const data = await prisma.purchase.findMany({
    where: { userId: session.userId },
    select: {
      purchaseDate: true,
      price: true,
      reviewType: true,
      isReviewPayback: true,
    },
  });

  return data;
}