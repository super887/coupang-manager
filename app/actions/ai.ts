'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { decryptText } from '@/lib/crypto';
import { cleanAndFormatAiReviews } from '@/lib/review-parser';

// 지원 모델 상수 (Gemini Flash Lite 모델)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

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


export interface SurveyQuestionItem {
  id: number;
  question: string;
  options: string[];
}

// 객관식 설문 라디오 항목 중 애매한 문항에 대해 가장 긍정적·이상적인 선택지 인덱스를 AI로 판별
export async function selectPositiveSurveyOptions(
  productName: string,
  questions: SurveyQuestionItem[]
): Promise<{ success: boolean; selections?: Record<number, number> }> {
  try {
    const session = await verifySession();
    if (!session?.userId) return { success: false };

    if (!Array.isArray(questions) || questions.length === 0) {
      return { success: false };
    }

    const safeQuestions = questions
      .slice(0, 15)
      .filter((q) => Array.isArray(q.options) && q.options.length > 0);
    if (safeQuestions.length === 0) return { success: false };

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { geminiApiKey: true },
    });
    if (!user?.geminiApiKey) return { success: false };

    const plainApiKey = decryptText(user.geminiApiKey);
    if (!plainApiKey) return { success: false };

    const promptText = [
      '다음은 쿠팡 상품에 대해 별점 5점 만점의 긍정 리뷰를 작성할 때 선택해야 하는 객관식 설문 문항 목록입니다.',
      `상품명: ${(productName || '').trim() || '(상품명 없음)'}`,
      '',
      '각 문항별로 상품 특성과 질문 의도에 비추어 만족한 구매자가 고를 가장 긍정적이고 이상적인 보기의 번호(0부터 시작하는 정수 인덱스)를 선택하세요.',
      '(주의: 사이즈/핏/길이 질문이면 극단적인 값 대신 "정사이즈예요/잘 맞아요/적당해요"를 선택하고, 품질/성능/만족도 질문이면 가장 긍정적인 보기를 선택하세요.)',
      '',
      '[문항 목록]',
      ...safeQuestions.map(
        (q) =>
          `id=${q.id} | 질문: ${q.question || '(질문 없음)'} | 보기: ${q.options
            .map((opt, idx) => `${idx}="${opt}"`)
            .join(', ')}`
      ),
      '',
      '반드시 다른 설명 없이 아래 순수 JSON 형식으로만 응답하세요:',
      '{"answers":[{"id":0,"choice":0}]}',
    ].join('\n');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': plainApiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);
    if (!res.ok) return { success: false };

    const data = await res.json();
    const rawJson = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '')
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    if (!rawJson) return { success: false };

    const parsed = JSON.parse(rawJson);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const selections: Record<number, number> = {};

    for (const q of safeQuestions) {
      const found = answers.find((a: any) => Number(a?.id) === q.id);
      const choiceIdx = Number(found?.choice);
      if (Number.isInteger(choiceIdx) && choiceIdx >= 0 && choiceIdx < q.options.length) {
        selections[q.id] = choiceIdx;
      }
    }

    return {
      success: Object.keys(selections).length > 0,
      selections,
    };
  } catch {
    return { success: false };
  }
}
