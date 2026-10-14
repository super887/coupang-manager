import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/session';

// [확장성 포인트]: 나중에 관리자(admin) 라우트 등이 추가되면 배열에 추가만 하면 됨
const protectedRoutes = ['/'];
const publicRoutes = ['/login'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.includes(path);
  const isPublicRoute = publicRoutes.includes(path);

  // 현재 세션 검증
  const session = await verifySession();

  // 로그인되지 않은 사용자가 보호된 페이지 접근 시 로그인으로 리다이렉트
  if (isProtectedRoute && !session?.userId) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // 이미 로그인된 사용자가 로그인 페이지 접근 시 메인으로 리다이렉트
  if (isPublicRoute && session?.userId) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  return NextResponse.next();
}

// 미들웨어가 실행될 경로 설정 (정적 파일 및 API 라우트 제외)
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};