import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export async function verifySession() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  if (!userId) return null;

  try {
    // DB에 이 유저가 진짜로 살아있는지 검증
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { id: true } 
    });

    // 만약 DB에 없는 썩은(?) 쿠키라면 강제 삭제해서 무한 루프 방지!
    if (!user) {
      cookieStore.delete('userId');
      return null;
    }

    return { userId };
  } catch (error) {
    console.error('세션 검증 중 에러:', error);
    return null;
  }
}