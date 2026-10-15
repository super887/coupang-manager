'use client';

import { logout } from '@/app/actions/auth';

export default function LogoutButton() {
  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    // 1. 서버에 "쿠키 지워라!" 명령하고 완전히 끝날 때까지 대기
    await logout();
    
    // 2. 쿠키가 완벽히 날아간 걸 확인한 후, 브라우저가 물리적으로 로그인 페이지로 강제 이동!
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