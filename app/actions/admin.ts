'use server';

import prisma from '@/lib/prisma';
import { createAdminSession, verifyAdminSession, safeStringCompare } from '@/lib/admin';
import { formatKST } from '@/lib/date';

const ALLOWED_ROLES = ['user', 'admin', 'blocked'] as const;

// ✨ 관리자 로그인 로직 (환경변수 기반 + 타이밍 안전 비교)
export async function adminLogin(id: string, pw: string) {
  const expectedId = process.env.ADMIN_ID || 'admin';
  const expectedPw = process.env.ADMIN_PASSWORD || '194826';

  const isIdValid = safeStringCompare(id?.trim() || '', expectedId);
  const isPwValid = safeStringCompare(pw || '', expectedPw);

  if (isIdValid && isPwValid) {
    await createAdminSession(expectedId);
    return { success: true };
  }

  return { success: false, error: '관리자 정보가 일치하지 않습니다.' };
}

// ✨ 관리자용 전체 유저 데이터 불러오기 (서버 액션 엄격 권한 검증)
export async function getAdminDashboardData() {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    throw new Error('관리자 권한이 없습니다.');
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      geminiApiKey: true, // hasApiKey 여부 판별용
      createdAt: true,
      _count: {
        select: { purchases: true }
      },
      purchases: {
        where: { isReviewWritten: true },
        select: { id: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalUsers = users.length;
  const totalPurchases = users.reduce((acc, user) => acc + user._count.purchases, 0);
  const totalReviews = users.reduce((acc, user) => acc + user.purchases.length, 0);

  // Gemini API 키 평문/암호문 원본이 클라이언트에 노출되지 않도록 hasApiKey(boolean)만 전달
  const formattedUsers = users.map(user => ({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    hasApiKey: !!user.geminiApiKey,
    createdAt: formatKST(user.createdAt),
    purchaseCount: user._count.purchases,
    reviewCount: user.purchases.length,
  }));

  return { totalUsers, totalPurchases, totalReviews, users: formattedUsers };
}

// ✨ 유저 권한/상태 변경 (화이트리스트 검증 + 관리자 권한 검증)
export async function updateUserRole(userId: string, newRole: string) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    throw new Error('관리자 권한이 없습니다.');
  }

  if (!ALLOWED_ROLES.includes(newRole as any)) {
    throw new Error('유효하지 않은 권한 값입니다.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole }
  });

  return { success: true };
}
