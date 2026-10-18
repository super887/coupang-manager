import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* 네비게이션 바 */}
      <header className="w-full bg-white border-b border-gray-200 py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="text-xl font-extrabold text-purple-600 tracking-tight">리뷰오토 📦</div>
        <div className="flex gap-4">
          <Link href="/login" className="px-5 py-2 text-sm font-bold text-gray-700 hover:text-purple-600 transition-colors">
            로그인
          </Link>
          <Link href="/dashboard" className="px-5 py-2 text-sm font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm">
            대시보드
          </Link>
        </div>
      </header>

      {/* 메인 히어로 섹션 */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="inline-block px-4 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-bold mb-6">
          ✨ 쿠팡 셀러를 위한 완벽한 솔루션
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-gray-900 mb-6 leading-tight">
          쿠팡 리뷰 관리, <br className="hidden md:block" />
          이제 <span className="text-purple-600">AI가 자동으로</span> 완성합니다
        </h1>
        <p className="text-lg md:text-xl text-gray-500 mb-10 max-w-2xl leading-relaxed font-medium">
          리뷰오토는 최신 생성형 AI(Gemini) 기술을 활용하여 쿠팡 상품 리뷰를 자연스럽게 작성하고, 
          구매 내역부터 페이백 정산까지 모든 과정을 한 번에 관리할 수 있는 스마트 SaaS 플랫폼입니다.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/dashboard" className="px-8 py-4 bg-gray-900 hover:bg-gray-800 text-white text-lg font-bold rounded-xl transition-all shadow-lg transform hover:-translate-y-1">
            지금 무료로 시작하기
          </Link>
          <a href="#features" className="px-8 py-4 bg-white border border-gray-300 hover:border-purple-600 text-gray-700 hover:text-purple-600 text-lg font-bold rounded-xl transition-all shadow-sm">
            자세히 알아보기
          </a>
        </div>
      </main>

      {/* 기능 소개 섹션 */}
      <section id="features" className="w-full bg-white py-20 px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">왜 리뷰오토를 선택해야 할까요?</h2>
            <p className="text-gray-500 font-medium">단순 반복 작업은 줄이고, 스토어 매출 상승에만 집중하세요.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="text-3xl mb-4">🤖</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">다중 페르소나 AI 리뷰</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                단조로운 매크로 리뷰는 이제 그만! 이모티콘형, 단백한 말투형, 가족 선물형 등 다양한 일반인 구매자 페르소나를 적용하여 100% 자연스러운 맞춤형 텍스트 리뷰를 생성합니다.
              </p>
            </div>
            <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">직관적인 구매 내역 관리</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                플랫폼별 구매 일자, 계정주, 결제 금액, 카톡방명 등 흩어져 있는 정보들을 하나의 통합된 테이블에서 손쉽게 관리하고 검색할 수 있습니다.
              </p>
            </div>
            <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="text-3xl mb-4">💰</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">완전 무료 API 연동</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                개인 Google Gemini API 키를 등록하여 월 최대 500건 이상의 고품질 AI 리뷰 생성을 추가 비용 없이 완전 무료로 이용해 보세요.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="w-full bg-gray-900 text-gray-400 py-8 text-center text-sm">
        <p>© 2026 리뷰오토. All rights reserved.</p>
        <p className="mt-2 text-xs">본 서비스는 구글 애드센스 정책을 준수하며, 안전한 데이터 관리를 최우선으로 합니다.</p>
      </footer>
    </div>
  );
}