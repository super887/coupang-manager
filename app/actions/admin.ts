'use server';

import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';

// ✨ 관리자 로그인 로직 (하드코딩된 자격 증명)
export async function adminLogin(id: string, pw: string) {
  if (id === 'admin' && pw === '194826') {
    const cookieStore = await cookies();
    // 관리자 전용 인증 쿠키 발급
    cookieStore.set('adminToken', 'super_secret_admin_token_2026', { 
      httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 
    });
    return { success: true };
  }
  return { success: false, error: '관리자 정보가 일치하지 않습니다.' };
}

// ✨ 관리자용 전체 유저 데이터 불러오기 (비밀번호 제외, 각종 통계 포함)
export async function getAdminDashboardData() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      geminiApiKey: true,
      createdAt: true,
      _count: {
        select: { purchases: true } // 등록한 상품(구매내역) 수
      },
      purchases: {
        where: { isReviewWritten: true },
        select: { id: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // 통계 계산
  const totalUsers = users.length;
  const totalPurchases = users.reduce((acc, user) => acc + user._count.purchases, 0);
  const totalReviews = users.reduce((acc, user) => acc + user.purchases.length, 0);

  // 데이터 가공
  const formattedUsers = users.map(user => ({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    hasApiKey: !!user.geminiApiKey,
    createdAt: user.createdAt.toISOString().split('T')[0],
    purchaseCount: user._count.purchases,
    reviewCount: user.purchases.length,
  }));

  return { totalUsers, totalPurchases, totalReviews, users: formattedUsers };
}

// ✨ 유저 권한/상태 변경 (블랙리스트 정지, 관리자 부여 등)
export async function updateUserRole(userId: string, newRole: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole }
  });
  return { success: true };
}