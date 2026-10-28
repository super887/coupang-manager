// 한국 표준시(KST, Asia/Seoul, UTC+9) 공통 날짜 포맷 유틸

/**
 * 오늘 날짜를 KST 기준 YYYY-MM-DD 문자열로 반환
 */
export function todayKST(): string {
  return formatKST(new Date());
}

/**
 * 주어진 날짜(Date 또는 string)를 KST 기준 YYYY-MM-DD 문자열로 반환
 */
export function formatKST(dateInput: Date | string | number): string {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' 
    ? new Date(dateInput) 
    : dateInput;

  if (isNaN(date.getTime())) {
    return '';
  }

  // en-CA 로케일은 YYYY-MM-DD 형태를 반환합니다.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
