import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/session';
import { verifyAdminToken } from '@/lib/admin';

// 보호 라우트 (로그인 필요)
const protectedRoutes = ['/dashboard', '/accounts', '/stats'];
// 공개 라우트 (비로그인 상태에서만 접근 또는 랜딩)
const publicRoutes = ['/', '/login'];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);
  const isAdminRoute = path.startsWith('/admin') && path !== '/admin/login';

  const sessionToken = request.cookies.get('sessionToken')?.value;
  const adminToken = request.cookies.get('adminToken')?.value;

  // 1. 관리자 구역 가드 (서명 검증)
  if (isAdminRoute) {
    const isValidAdmin = await verifyAdminToken(adminToken);
    if (!isValidAdmin) {
      return NextResponse.redirect(new URL('/admin/login', request.nextUrl));
    }
  }

  // 2. 일반 세션 검증 (서명 검증)
  const session = await verifySessionToken(sessionToken);

  // 3. 비로그인 유저가 보호 라우트(/dashboard, /accounts, /stats)에 접근하면 로그인창으로 리다이렉트
  if (isProtectedRoute && !session?.userId) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // 4. 이미 로그인한 유저가 랜딩(/)이나 로그인창(/login)에 오면 대시보드로 즉시 안내
  if (isPublicRoute && session?.userId) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
