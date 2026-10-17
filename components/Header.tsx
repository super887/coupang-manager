import Link from 'next/link';
import { verifySession } from '@/lib/session';
import prisma from '@/lib/prisma';
import LogoutButton from '@/components/LogoutButton';

export default async function Header({ active = 'dashboard' }: { active?: 'dashboard' | 'accounts' | 'stats' }) {
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
        
        {/* ⬅️ 왼쪽 영역: 서비스 로고 및 메인 메뉴 */}
        <div className="flex items-center gap-8">
          <h1 className="font-bold text-xl tracking-tight text-gray-900">리뷰오토 📦</h1>
          
          <nav className="flex items-center gap-6">
            <Link href="/" className={`pb-1 transition-colors ${active === 'dashboard' ? 'text-gray-900 font-semibold border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-900 font-medium'}`}>
              대시보드
            </Link>
            <Link href="/accounts" className={`pb-1 transition-colors ${active === 'accounts' ? 'text-gray-900 font-semibold border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-900 font-medium'}`}>
              계정정보관리
            </Link>
            <Link href="/stats" className={`pb-1 transition-colors ${active === 'stats' ? 'text-gray-900 font-semibold border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-900 font-medium'}`}>
              통계 및 정산
            </Link>
          </nav>
        </div>

        {/* ➡️ 오른쪽 영역: 소통·문의 링크 + 유저 정보 + 로그아웃 */}
        <div className="flex items-center gap-6">
          
          {/* ✨ 소통 문의 -> 소통·문의 로 변경! */}
          <a 
            href="https://open.kakao.com/o/gVXU8SSi" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-gray-500 hover:text-yellow-500 font-medium transition-colors"
          >
            <img 
              src="https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e3/KakaoTalk_logo.svg/250px-KakaoTalk_logo.svg.png?utm_source=ko.wikisource.org&utm_campaign=index&utm_content=thumbnail" 
              alt="카카오톡" 
              className="w-5 h-5 object-contain"
            />
            소통·문의
          </a>

          {/* 깔끔한 세로 구분선 */}
          <div className="w-px h-5 bg-gray-200"></div>

          {/* 유저 이름 및 로그아웃 버튼 */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">{user.name} 님</span>
            <LogoutButton />
          </div>

        </div>
        
      </div>
    </header>
  );
}