'use client';

import { logout } from '@/app/actions/auth';

export default function LogoutButton() {
  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      // 1. 서버 액션을 호출해서 쿠키를 싹 지웁니다.
      await logout();
    } catch (error) {
      console.error('로그아웃 에러:', error);
    } finally {
      // 2. 서버 에러가 나든 말든, 브라우저가 강제로 로그인 페이지로 멱살 잡고 끌고 갑니다! (Crash 원천 차단)
      window.location.href = '/login';
    }
  };

  return (
    <button 
      onClick={handleLogout} 
      className="text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
    >
      로그아웃
    </button>
  );
}