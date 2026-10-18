import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = ['/'];
const publicRoutes = ['/login'];
const adminRoutes = ['/admin']; // ✨ 관리자 경로 추가

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.includes(path);
  const isPublicRoute = publicRoutes.includes(path);
  const isAdminRoute = path.startsWith('/admin') && path !== '/admin/login'; // 관리자 경론데 로그인창이 아닌 경우

  const userId = request.cookies.get('userId')?.value;
  const adminToken = request.cookies.get('adminToken')?.value;

  // ✨ 관리자 라우트 보호
  if (isAdminRoute && !adminToken) {
    return NextResponse.redirect(new URL('/admin/login', request.nextUrl));
  }

  // 일반 라우트 보호
  if (isProtectedRoute && !userId) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  if (isPublicRoute && userId) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};