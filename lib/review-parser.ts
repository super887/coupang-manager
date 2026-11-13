/**
 * AI 리뷰 텍스트 전처리 및 스타일 분리 유틸리티
 * 
 * Gemini 생성 결과에 포함될 수 있는 번호/라벨("1.", "첫번째리뷰 :", "**1번 스타일**:" 등)을
 * 완벽하게 제거하고 순수 리뷰 본문만 추출 및 각 스타일별 분리를 수행합니다.
 */

function cleanSingleReviewBlock(block: string): string {
  let text = (block || '').trim();

  // 반복적으로 줄 시작 부분의 번호/라벨/헤더 패턴만 정밀 제거 ("1+1", "2.5L", "세탁", "두께" 등 일반 단어 오탐 원천 차단)
  // 예: "1.", "첫번째리뷰 :", "**1번 리뷰**:", "### 1.", "(1)", "[1]", "스타일 1:" 등
  const lineLabelRegex =
    /^(?:#{1,6}\s*)?(?:\*{1,3}|_{1,3})?\s*(?:(?:\[|\()?(?:첫|두|세|쎄)\s*(?:번째|번)(?:\s*(?:리뷰|스타일))?(?:\s*\([^\)]*\))?(?:\]|\))?\s*[:：.\-\)]*|(?:\[|\()?[1-9](?:\]|\))?(?:\s*(?:번째|번)(?:\s*(?:리뷰|스타일))?|\s*(?:리뷰|스타일)|\s*(?:[\.\)\:]|：)(?!\d))(?:\s*\([^\)]*\))?\s*[:：.\-\)]*|(?:리뷰|스타일)\s*[1-9](?:\s*\([^\)]*\))?\s*[:：.\-\)]*)\s*(?:\*{1,3}|_{1,3})?\s*[:：\-]?\s*/i;

  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(lineLabelRegex, '').trim();
    // 줄바꿈 후 다음 줄에도 라벨만 단독으로 있던 경우 연속 처리
    text = text.replace(/^[\r\n]+/, '').trim();
  }

  // 앞뒤 전체를 감싼 따옴표 제거 ("...", '...', 「...」)
  text = text.replace(/^["'「]([\s\S]*)["'」]$/, '$1').trim();

  return text;
}

/**
 * 다중 스타일 리뷰 텍스트를 개별 스타일 배열로 분리 (앞머리 라벨 제거 완료 상태)
 */
export function splitReviewCandidates(rawText: string | null | undefined): string[] {
  if (!rawText || !rawText.trim()) return [];
  const text = rawText.trim();

  // 2번, 3번 리뷰의 시작 경계 감지 (줄바꿈 뒤에 2., 2번, 두번째, 3., 3번, 세번째 등이 시작; "2.5L", "4개", "세탁" 등 제외)
  const boundaryRegex =
    /(?:\r?\n)+\s*(?=(?:#{1,6}\s*)?(?:\*{1,3}|_{1,3})?\s*(?:(?:\[|\()?(?:두|세|쎄)\s*(?:번째|번)|(?:\[|\()?[2-9](?:\]|\))?(?:\s*(?:번째|번)|\s*(?:리뷰|스타일)|\s*(?:[\.\)\:]|：)(?!\d))|(?:리뷰|스타일)\s*[2-9]))/i;

  let blocks = text.split(boundaryRegex);
  if (blocks.length < 2) {
    blocks = text.split(/\r?\n\s*\r?\n+/);
  }
  // 단일 줄바꿈(\n)으로만 2~3개 리뷰가 구분된 경우 폴백 분리
  if (blocks.length < 2) {
    const lineBlocks = text
      .split(/\r?\n+/)
      .map((b) => b.trim())
      .filter((b) => b.length >= 20);
    if (lineBlocks.length >= 2) {
      blocks = lineBlocks;
    }
  }

  const cleaned = blocks.map(cleanSingleReviewBlock).filter((b) => b.length > 0);
  return cleaned.length > 0 ? cleaned : [cleanSingleReviewBlock(text)];
}

/**
 * 생성된 리뷰가 중간에 잘리지 않고 3개 스타일 모두 정상 완성되었는지 검증
 */
export function isValidThreeStyleReview(rawText: string | null | undefined): boolean {
  const styles = splitReviewCandidates(rawText);
  if (styles.length < 3) return false;

  const COMPLETE_ENDING_RE =
    /(?:[.!?~^ㅋㅎㅠㅜ♪♡♥★☆"'\)\]]|(?:요|다|음|함|듯|각|굿|짱|끝|네요|군요|랍니다|입니다|습니다|어요|아요|해요|돼요|게요|래요|대요|셔요|세요|지요|죠|임|됨))$/;

  for (let i = 0; i < 3; i++) {
    const s = (styles[i] || '').trim();
    if (s.length < 60) return false;
    if (!COMPLETE_ENDING_RE.test(s)) return false;
  }

  return true;
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

/**
 * 단일 리뷰 텍스트에서 앞 N문장(기본 2문장)만 추출 ("한줄텍" 스타일용)
 */
export function extractFirstSentences(
  text: string | null | undefined,
  maxSentences: number = 2
): string {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const sentences = cleaned
    .split(
      /(?<=[.!?])\s+|(?<=(?:습니다|입니다|네요|해요|어요|아요|군요|더라고요|더라구요|같아요|좋아요|만족해요|추천해요|편해요|튼튼해요|최고예요|최고입니다|있어요|없어요|됩니다|돼요|할게요|랍니다|강추합니다|추천합니다)[.!?~]*)\s+/
    )
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= maxSentences) {
    return cleaned;
  }

  return sentences.slice(0, maxSentences).join(' ').trim();
}

