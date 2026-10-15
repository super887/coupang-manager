import Link from 'next/link';
import { verifySession } from '@/lib/session';
import prisma from '@/lib/prisma';
import LogoutButton from '@/components/LogoutButton';

export default async function Header({ active = 'dashboard' }: { active?: 'dashboard' | 'accounts' }) {
  // 세션과 유저 정보를 여기서 한 번만 불러옵니다.
  const session = await verifySession();
  if (!session?.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  });

  if (!user) return null;

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1 className="font-bold text-xl tracking-tight text-gray-900">쿠팡 리뷰 매니저</h1>
          <nav className="flex gap-6">
            <Link 
              href="/" 
              className={`pb-1 transition-colors ${active === 'dashboard' ? 'text-gray-900 font-semibold border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-900 font-medium'}`}
            >
              대시보드
            </Link>
            <Link 
              href="/accounts" 
              className={`pb-1 transition-colors ${active === 'accounts' ? 'text-gray-900 font-semibold border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-900 font-medium'}`}
            >
              계정정보관리
            </Link>
          </nav>
        </div>
        
        {/* ✨ 모든 페이지에 동일하게 렌더링될 로그아웃 버튼 */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
            {user.name} 님
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}