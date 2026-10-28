import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';

const ADMIN_COOKIE_NAME = 'adminToken';
const ONE_DAY = 60 * 60 * 24;

function getAdminSecret(): Uint8Array {
  const secret = (process.env.SESSION_SECRET || 'super-secret-key-at-least-32-characters-long-for-jwt') + '-admin-secret';
  return new TextEncoder().encode(secret);
}

/**
 * 안전한 상수 시간 문자열 비교 (타이밍 공격 방지)
 */
export function safeStringCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // 길이가 다르면 다른 문자열이지만 타이밍 보호를 위해 더미 비교 수행
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 관리자 로그인 시 서명된 관리자 전용 JWT 발급
 */
export async function createAdminSession(adminId: string): Promise<string> {
  const secret = getAdminSecret();
  const token = await new SignJWT({ adminId, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_DAY,
  });

  return token;
}

/**
 * 관리자 서버 액션 내부에서 호출하는 엄격한 권한 검증 함수
 */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return false;

    const secret = getAdminSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * 관리자 로그아웃
 */
export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

/**
 * Proxy / Middleware(Edge 런타임 호환)에서 관리자 토큰 검증용 헬퍼
 */
export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const secret = getAdminSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}
