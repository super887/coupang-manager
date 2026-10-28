'use client';

import { logout } from '@/app/actions/auth';
import { clearAllUserCaches } from '@/lib/useCachedData';

export default function LogoutButton() {
  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();

    // 1. 서버 세션 쿠키 삭제
    await logout();

    // 2. 다른 사용자의 데이터 노출을 막기 위해 브라우저 로컬 캐시 전체 초기화
    clearAllUserCaches();

    // 3. 브라우저 캐시 클린업 후 로그인 페이지로 안전하게 이동
    window.location.href = '/login';
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
