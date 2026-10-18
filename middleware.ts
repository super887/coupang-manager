import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = ['/dashboard']; // 로그인해야만 볼 수 있는 대시보드
const publicRoutes = ['/', '/login'];   // 누구나 볼 수 있는 랜딩페이지와 로그인창
const adminRoutes = ['/admin'];         // 관리자 전용

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);
  const isAdminRoute = path.startsWith('/admin') && path !== '/admin/login';

  const userId = request.cookies.get('userId')?.value;
  const adminToken = request.cookies.get('adminToken')?.value;

  // 1. 관리자 구역 쉴드
  if (isAdminRoute && !adminToken) {
    return NextResponse.redirect(new URL('/admin/login', request.nextUrl));
  }

  // 2. 비로그인 유저가 대시보드에 몰래 들어오려 하면 로그인창으로 쫓아냄
  if (isProtectedRoute && !userId) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // 3. ✨ [무한 루프 해결 구간] 
  // 이미 로그인한 유저가 랜딩페이지(/)나 로그인창(/login)에 오면, 빙빙 돌지 않게 진짜 '대시보드(/dashboard)'로 꽂아줌
  if (isPublicRoute && userId) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};