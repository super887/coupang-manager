'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';

export async function getStatsData() {
  const session = await verifySession();
  if (!session?.userId) return [];

  // 통계 및 엑셀 다운로드에 필요한 필드만 엄선하여 전송량/지연 최소화
  const data = await prisma.purchase.findMany({
    where: { userId: session.userId },
    select: {
      id: true,
      purchaseDate: true,
      accountHolder: true,
      productName: true,
      chatRoomName: true,
      platform: true,
      price: true,
      reviewType: true,
      paybackName: true,
      contactOnBangpok: true,
      isReviewWritten: true,
      isProductPayback: true,
      isReviewPayback: true,
      generatedReview: true,
      createdAt: true,
    },
    orderBy: { purchaseDate: 'desc' },
  });

  return data;
}
