/**
 * AI 리뷰 텍스트 전처리 및 스타일 분리 유틸리티
 * 
 * Gemini 생성 결과에 포함될 수 있는 번호/라벨("1.", "첫번째리뷰 :", "**1번 스타일**:" 등)을
 * 완벽하게 제거하고 순수 리뷰 본문만 추출 및 각 스타일별 분리를 수행합니다.
 */

function cleanSingleReviewBlock(block: string): string {
  let text = (block || '').trim();

  // 반복적으로 줄 시작 부분의 번호/라벨/헤더 패턴 제거
  // 예: "1.", "첫번째리뷰 :", "**1번 리뷰**:", "### 1.", "(1)", "[1]", "스타일 1:" 등
  const lineLabelRegex = /^(?:#{1,6}\s*)?(?:\*{1,3}|_{1,3})?\s*(?:\[|\()? *(?:[1-9]|첫|두|세|쎄)(?:\s*번째|\s*번)?(?:\s*리뷰|\s*스타일)?(?:\s*\([^\)]*\))? *(?:\]|\))? *(?:[\.\:\)\-]|：|번)?\s*(?:\*{1,3}|_{1,3})?\s*[:：\-]?\s*/i;

  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(lineLabelRegex, '').trim();
    // 줄바꿈 후 다음 줄에도 라벨만 단독으로 있던 경우 연속 처리
    text = text.replace(/^[\r\n]+/, '').trim();
  }

  // 앞뒤 따옴표 제거 ("...", '...', 「...」)
  text = text.replace(/^["'「]([\s\S]*)["'」]$/, '$1').trim();

  return text;
}

/**
 * 다중 스타일 리뷰 텍스트를 개별 스타일 배열로 분리 (앞머리 라벨 제거 완료 상태)
 */
export function splitReviewCandidates(rawText: string | null | undefined): string[] {
  if (!rawText || !rawText.trim()) return [];
  const text = rawText.trim();

  // 2번, 3번 리뷰의 시작 경계 감지 (줄바꿈 뒤에 2번, 두번째, 3번, 세번째 등이 시작)
  const boundaryRegex = /(?:\r?\n)+\s*(?=(?:#{1,6}\s*)?(?:\*{1,3}|_{1,3})?\s*(?:\[|\()? *(?:[2-9]|두|세|쎄)(?:\s*번째|\s*번)?(?:\s*리뷰|\s*스타일)?(?:\s*\([^\)]*\))? *(?:\]|\))? *(?:[\.\:\)\-]|：|번)?\s*(?:\*{1,3}|_{1,3})?\s*[:：\-]?\s*)/i;

  let blocks = text.split(boundaryRegex);
  if (blocks.length < 2) {
    blocks = text.split(/\r?\n\s*\r?\n+/);
  }

  const cleaned = blocks.map(cleanSingleReviewBlock).filter((b) => b.length > 0);
  return cleaned.length > 0 ? cleaned : [cleanSingleReviewBlock(text)];
}

/**
 * AI가 생성한 텍스트에서 불필요한 라벨을 모두 제거하고, 
 * 각 리뷰 사이에 줄바꿈(\n\n)을 적용하여 정돈된 텍스트로 변환
 */
export function cleanAndFormatAiReviews(rawText: string | null | undefined): string {
  const parts = splitReviewCandidates(rawText);
  return parts.join('\n\n');
}

/**
 * 특정 인덱스(0, 1, 2...)의 단일 순수 리뷰 텍스트를 추출
 */
export function extractCleanReview(rawText: string | null | undefined, styleIndex: number = 0): string {
  const candidates = splitReviewCandidates(rawText);
  if (candidates.length === 0) return '';
  return candidates[Math.abs(styleIndex) % candidates.length];
}
