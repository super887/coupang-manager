'use client';

import { useState, useEffect } from 'react';
import ApiKeyForm from '@/components/ApiKeyForm';
import PurchaseTable from '@/components/PurchaseTable';
import { getDashboardData } from '@/app/actions/info';

export default function DashboardClientWrapper() {
  const [data, setData] = useState({
    hasApiKey: false,
    customPrompt: '',
    accounts: [] as any[],
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // 1. 내 컴퓨터(브라우저)에 저장된 캐시가 있으면 즉시 0.001초 만에 화면에 그림
    const cached = localStorage.getItem('optimistic_dashboard');
    if (cached) {
      setData(JSON.parse(cached));
    }
    setIsLoaded(true);

    // 2. 뒤에서 몰래 서버와 통신하여 최신 데이터로 덮어쓰고 다시 캐시에 저장
    const fetchLatestData = async () => {
      try {
        const latestData = await getDashboardData();
        if (latestData) {
          setData(latestData);
          localStorage.setItem('optimistic_dashboard', JSON.stringify(latestData));
        }
      } catch (error) {
        console.error('대시보드 데이터 동기화 실패:', error);
      }
    };

    fetchLatestData();
  }, []);

  return (
    <div className={!isLoaded ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}>
      
      {/* ✨ 플랫폼 바로가기 영역 & 우측 쿠팡 파트너스 검색창 */}
      <div className="mb-6 flex flex-col xl:flex-row justify-between items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-gray-200">
        
        {/* 왼쪽: 기존 플랫폼 바로가기 버튼들 (디자인 유지!) */}
        <div className="flex flex-wrap gap-3 w-full xl:w-auto">
          
          {/* ✨ 쿠팡: 형님의 파트너스 수익 링크로 교체 완료! */}
          <a
            href="https://link.coupang.com/a/hWThgSlpCu" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group shadow-sm"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img 
                src="data:image/png;base64,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" 
                alt="Coupang" 
                className="w-full h-full object-cover" 
              />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-blue-700 text-sm transition-colors">🚀 쿠팡(할인)</span>
          </a>
          
          {/* 네이버 */}
          <a
            href="https://www.naver.com/" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-400 hover:bg-green-50 transition-all group shadow-sm"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img 
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcBAMAAACAI8KnAAAAMFBMVEUeyAAAxQAAxADs+ev////6//m467Pi9uHD7r6x6KuC3XgmygrU89CQ4Iin5qHJ8cMfkHdFAAAAYUlEQVR4AWOgKRBSUgIRihAeo4mLKwNjiouzAIRb4uLSxDjFxR3B9RJE4bpsROUeQuX6PkHhunxB4voD+UhcvysoXE8dVK40KldwCQpXQALBNXFxE2AIgXoB6jclIEFLAAD2tiUhfIzieAAAAABJRU5ErkJggg==" 
                alt="Naver" 
                className="w-full h-full object-cover p-1" 
              />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">네이버</span>
          </a>

          {/* 지마켓 */}
          <a
            href="https://www.gmarket.co.kr/" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-500 hover:bg-green-50 transition-all group shadow-sm"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img 
                src="https://blog.kakaocdn.net/dna/UIGeR/btsrsRIruv5/AAAAAAAAAAAAAAAAAAAAADL-V5RuANqZCBbmB1nfPUBHhPnlaiQkiZjOsh2H8qCv/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1793458799&allow_ip=&allow_referer=&signature=5xg4LbafYGjRmlGtNYT2HKyoz6I%3D" 
                alt="Gmarket" 
                className="w-full h-full object-cover" 
              />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">지마켓</span>
          </a>

          {/* 11번가 */}
          <a
            href="https://www.11st.co.kr/" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-red-500 hover:bg-red-50 transition-all group shadow-sm"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img 
                src="https://i.namu.wiki/i/Hoj-MVl7c1jGLFuXwYHtyTZ0GgGEvsOxKeJ2wNlqF6bEo9pvzGIgb0YN6bnNfoO-IufDLE0M2j0vRk8BJo042Ipo-hCiBsZ1ojt6AOJgmJ9-dFm-mVcySPxLowRzVHVyuZ-eJYkUnoloRdl6wIYsgg.svg" 
                alt="11st" 
                className="w-full h-full object-cover p-1" 
              />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-red-700 text-sm transition-colors">11번가</span>
          </a>
        </div>

        {/* ✨ 오른쪽: 쿠팡 파트너스 검색창 (높이 최적화) */}
        <div className="w-full xl:w-[300px] h-[75px] rounded-xl overflow-hidden flex items-center justify-center xl:justify-end border border-gray-100 shadow-sm flex-shrink-0">
          <iframe 
            src="https://coupa.ng/cqe0B2" 
            width="100%" 
            height="75" 
            frameBorder="0" 
            scrolling="no" 
            referrerPolicy="unsafe-url"
            title="쿠팡 상품 검색"
            className="w-full h-full"
          ></iframe>
        </div>
        
      </div>

      {/* API 키 폼 영역 */}
      <ApiKeyForm 
        key={`api-form-${data.hasApiKey}`} 
        initialHasKey={data.hasApiKey} 
        initialPrompt={data.customPrompt} 
      />

      {/* 시트(테이블) 영역 */}
      <div className="mt-6">
        <PurchaseTable accounts={data.accounts} hasApiKey={data.hasApiKey} />
      </div>

    </div>
  );
}