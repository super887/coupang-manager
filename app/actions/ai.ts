'use server';

export const maxDuration = 60;

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

export async function generateAiReview(purchaseId: string, productName: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  // 1. 유저의 API 키와 커스텀 프롬프트 가져오기
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  // 2. 기본 문장 없이, 유저가 입력한 프롬프트와 상품명만 조합
  const userPrompt = user.customPrompt || '';
  const finalPrompt = `${userPrompt}\n\n[제품명]: ${productName}`;

  
// 3. Gemini API 호출 (Gemini 3.5 Flash Lite 모델로 완벽 교체)
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${user.geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: finalPrompt }] }]
    })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'API 요청에 실패했습니다.');

  const generatedText = data.candidates[0].content.parts[0].text;

  // 4. 생성된 텍스트를 Purchase 테이블에 저장
  await prisma.purchase.update({
    where: { id: purchaseId, userId: session.userId },
    data: { generatedReview: generatedText }
  });

  revalidatePath('/');
  return generatedText; // ✨ 이 반환값이 추가되었습니다! (화면 실시간 갱신용)
}