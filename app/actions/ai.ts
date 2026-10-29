'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { decryptText } from '@/lib/crypto';
import { cleanAndFormatAiReviews } from '@/lib/review-parser';

// 지원 모델 상수 (Gemini Flash Lite 모델)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export async function generateAiReview(purchaseId: string, productName: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  const trimmedProductName = productName?.trim();
  if (!trimmedProductName) {
    throw new Error('상품명을 먼저 입력해주세요.');
  }

  // 1. 유저의 암호화된 API 키와 커스텀 프롬프트 가져오기
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { geminiApiKey: true, customPrompt: true },
  });

  if (!user?.geminiApiKey) {
    throw new Error('API 키가 설정되지 않았습니다. 상단 API 키 등록을 먼저 진행해주세요.');
  }

  // API 키 복호화
  const plainApiKey = decryptText(user.geminiApiKey);
  if (!plainApiKey) {
    throw new Error('API 키 복호화에 실패했습니다. 키를 다시 등록해주세요.');
  }

  // 2. 프롬프트 구성
  const userPrompt = user.customPrompt || '';
  const finalPrompt = `${userPrompt}\n\n[제품명]: ${trimmedProductName}`;

  // 3. Gemini REST API 호출 (URL 쿼리 대신 x-goog-api-key 보안 헤더 사용 + 타임아웃 30초)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let generatedText = '';

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': plainApiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalPrompt }] }],
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.error?.message || 'Gemini API 호출에 실패했습니다.';
      if (res.status === 429) {
        throw new Error('요청 한도(할당량)를 초과했습니다. 잠시 후 다시 시도해주세요.');
      }
      throw new Error(errMsg);
    }

    // 응답 방어적 파싱
    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0]?.text;

    if (!textPart) {
      if (candidate?.finishReason === 'SAFETY') {
        throw new Error('AI 안전 필터 정책에 의해 리뷰 생성이 차단되었습니다.');
      }
      throw new Error('AI로부터 비어 있는 응답을 받았습니다.');
    }

    generatedText = textPart;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('AI 응답 시간이 초과되었습니다 (30초 제한).');
    }
    throw error;
  }

  // 불필요한 라벨('1.', '첫번째리뷰 :' 등) 자동 제거 및 리뷰 간 줄바꿈(\n\n) 적용
  const formattedReview = cleanAndFormatAiReviews(generatedText);

  // 4. 생성된 텍스트를 Purchase 테이블에 저장 (소유자 안전 확인)
  await prisma.purchase.update({
    where: { id: purchaseId, userId: session.userId },
    data: { generatedReview: formattedReview },
  });

  return formattedReview;
}
