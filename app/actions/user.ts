'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

// [확장성 포인트]: 향후 유저 프로필 수정, 알림 설정 등 유저 관련 기능이 추가될 때 여기에 함수만 덧붙이면 됩니다.
export async function updateGeminiKey(prevState: any, formData: FormData) {
  const session = await verifySession();
  
  if (!session?.userId) {
    return { error: '로그인이 필요합니다.' };
  }

  const apiKey = formData.get('apiKey')?.toString().trim();
  
  if (!apiKey) {
    return { error: 'API 키를 입력해주세요.' };
  }

  try {
    await prisma.user.update({
      where: { id: session.userId },
      data: { geminiApiKey: apiKey },
    });

    // 업데이트 성공 시 메인 페이지 데이터를 새로고침하여 즉시 반영
    revalidatePath('/');
    return { success: true, message: 'API 키가 성공적으로 저장되었습니다.' };
  } catch (error) {
    console.error('Update API Key Error:', error);
    return { error: '저장 중 오류가 발생했습니다.' };
  }
}