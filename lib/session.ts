import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

// 세션 비밀키 가져오기
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET || 'super-secret-key-at-least-32-characters-long-for-jwt';
  return new TextEncoder().encode(secret);
}

const SESSION_COOKIE_NAME = 'sessionToken';
const LEGACY_COOKIE_NAME = 'userId';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  userId: string;
  role?: string;
}

/**
 * 로그인/회원가입 시 서명된 JWT 세션 쿠키를 발급
 */
export async function createSession(userId: string, role: string = 'user'): Promise<string> {
  const secret = getSecretKey();
  const token = await new SignJWT({ userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SEVEN_DAYS,
  });

  // 이전 평문 쿠키가 남아있다면 확실히 삭제
  cookieStore.delete(LEGACY_COOKIE_NAME);

  return token;
}

/**
 * 서버 액션 및 API 라우트에서 세션을 검증
 * 서명 검증만으로 처리하여 불필요한 매 요청 DB 왕복 조회를 제거합니다.
 */
export async function verifySession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);

    const userId = payload.userId as string;
    const role = (payload.role as string) || 'user';

    if (!userId) {
      return null;
    }

    // 차단(blocked)된 유저는 세션 무효화
    if (role === 'blocked') {
      return null;
    }

    return { userId, role };
  } catch {
    return null;
  }
}

/**
 * 로그아웃 시 세션 쿠키 제거
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(LEGACY_COOKIE_NAME);
}

/**
 * Proxy / Middleware(Edge 런타임 호환)에서 토큰을 검증할 때 사용하는 헬퍼
 */
export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.userId as string;
    const role = (payload.role as string) || 'user';
    if (!userId || role === 'blocked') return null;
    return { userId, role };
  } catch {
    return null;
  }
}
