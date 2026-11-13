'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { decryptText } from '@/lib/crypto';
import { cleanAndFormatAiReviews, isValidThreeStyleReview } from '@/lib/review-parser';

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

  // 2. 프롬프트 구성 (3개 스타일 모두 중간 잘림 없이 끝까지 완성하도록 명시 보강)
  const userPrompt = user.customPrompt || '';
  const finalPrompt = `${userPrompt}\n\n[주의사항]: 반드시 1번, 2번, 3번 총 3개의 리뷰를 단 한 글자도 중간에 끊기거나 생략하지 말고 마침표/이모티콘까지 완전한 문장으로 끝까지 작성하세요.\n\n[제품명]: ${trimmedProductName}`;

  const MAX_ATTEMPTS = 3;
  let formattedReview = '';
  let lastError: any = null;

  // 3. Gemini REST API 호출 + 다중 파트 병합 + 3개 스타일 완결성 검증 (잘림 감지 시 최대 3회 자동 재시도)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.75,
            },
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

      // 응답 방어적 파싱: Gemini 3.5 모델이 thoughtSignature 등으로 parts를 여러 조각으로 나눈 경우 전체 텍스트 병합!
      const candidate = data.candidates?.[0];
      const rawParts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      const textPart = rawParts
        .filter((p: any) => !p?.thought && typeof p?.text === 'string')
        .map((p: any) => p.text)
        .join('');

      if (!textPart) {
        if (candidate?.finishReason === 'SAFETY') {
          throw new Error('AI 안전 필터 정책에 의해 리뷰 생성이 차단되었습니다.');
        }
        throw new Error('AI로부터 비어 있는 응답을 받았습니다.');
      }

      // 불필요한 라벨('1.', '첫번째리뷰 :' 등) 자동 제거 및 리뷰 간 줄바꿈(\n\n) 적용
      const candidateFormatted = cleanAndFormatAiReviews(textPart);

      // 3개 스타일이 모두 존재하고 문장 중간에 잘리지 않았는지 검증
      if (isValidThreeStyleReview(candidateFormatted)) {
        formattedReview = candidateFormatted;
        break;
      }

      // 만약 잘렸다면 다음 attempt에서 자동 재시도 (마지막 시도에서도 잘린 경우라도 더 긴 결과 보관)
      if (candidateFormatted.length > formattedReview.length) {
        formattedReview = candidateFormatted;
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        lastError = new Error('AI 응답 시간이 초과되었습니다 (30초 제한).');
      } else {
        lastError = error;
      }
      // 안전 필터나 할당량 초과는 즉시 중단
      const msg = String(lastError?.message || '');
      if (msg.includes('안전') || msg.includes('한도') || msg.includes('할당량')) {
        throw lastError;
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  if (!formattedReview) {
    throw lastError || new Error('AI 리뷰 생성에 실패했습니다.');
  }

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
    const rawParts = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
      : [];
    const rawJson = rawParts
      .filter((p: any) => !p?.thought && typeof p?.text === 'string')
      .map((p: any) => p.text)
      .join('')
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
