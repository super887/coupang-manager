import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = ['/'];
const publicRoutes = ['/login'];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.includes(path);
  const isPublicRoute = publicRoutes.includes(path);

  // ✨ 핵심 수정: 무거운 verifySession() 대신, 미들웨어 자체 기능으로 빠르고 안전하게 쿠키 확인!
  const userId = request.cookies.get('userId')?.value;

  // 로그인되지 않은 사용자가 보호된 페이지(대시보드) 접근 시 로그인으로 튕겨냄
  if (isProtectedRoute && !userId) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // 이미 로그인된(도장이 있는) 사용자가 로그인 페이지 접근 시 메인으로 자동 통과
  if (isPublicRoute && userId) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};