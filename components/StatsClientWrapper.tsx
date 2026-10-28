'use client';

import { useState, useMemo } from 'react';
import { getStatsData } from '@/app/actions/stats';
import { useCachedData } from '@/lib/useCachedData';
import { todayKST } from '@/lib/date';

const getStr = (val: any) => (val === null || val === undefined) ? '' : String(val);
const getNum = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

// ✨ 통계 페이지 전용 쿠팡 배너 컴포넌트 (리액트 충돌 방지용 샌드박스 처리)
const StatsCoupangBanner = () => {
  const iframeHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { 
            margin: 0; padding: 0; 
            display: flex; justify-content: center; align-items: center; 
            background-color: transparent; 
          }
        </style>
      </head>
      <body>
        <script src="https://ads-partners.coupang.com/g.js"></script>
        <script>
          new PartnersCoupang.G({"id":1040739,"template":"carousel","trackingCode":"AF5941029","width":"680","height":"140","tsource":""});
        </script>
      </body>
    </html>
  `;

  return (
    <div className="w-full flex flex-col items-center justify-center py-8 bg-gray-50 border-t border-gray-200 mt-6 rounded-2xl shadow-sm border">
      <iframe
        srcDoc={iframeHtml}
        width="680"
        height="140"
        frameBorder="0"
        scrolling="no"
        className="max-w-full"
        style={{ border: 'none', backgroundColor: 'transparent' }}
      />
      <p className="mt-4 text-[11px] text-gray-400 tracking-tight text-center font-medium">
        "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
      </p>
    </div>
  );
};

export default function StatsClientWrapper() {
  const currentKst = todayKST();
  const defaultMonth = currentKst.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const { data: rawData, isLoaded } = useCachedData<any[]>({
    key: 'optimistic_stats',
    initialData: [],
    fetcher: async () => {
      const data = await getStatsData();
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!selectedMonth) return { totalJobs: 0, totalCost: 0, estimatedProfit: 0, actualProfit: 0, dailyCounts: [], daysInMonth: 30 };

    const [year, month] = selectedMonth.split('-');
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    
    let totalJobs = 0;
    let totalCost = 0;
    let estimatedProfit = 0;
    let actualProfit = 0;
    
    const dailyCounts = Array.from({ length: daysInMonth }, () => 0);

    rawData.forEach(item => {
      const dateStr = getStr(item.purchaseDate);
      if (!dateStr.startsWith(selectedMonth)) return; 

      const day = parseInt(dateStr.split('-')[2], 10);
      if (day >= 1 && day <= daysInMonth) {
        dailyCounts[day - 1] += 1;
      }

      totalJobs += 1;
      totalCost += getNum(item.price);

      let profit = 0;
      const rType = getStr(item.reviewType);
      if (rType === '(빈)별점') profit = 500;
      else if (rType === '(빈)텍스트' || rType === '(빈)원고제공') profit = 1000;

      estimatedProfit += profit;
      if (item.isReviewPayback) {
        actualProfit += profit; 
      }
    });

    return { totalJobs, totalCost, estimatedProfit, actualProfit, dailyCounts, daysInMonth };
  }, [rawData, selectedMonth]);

  const handleExportExcel = () => {
    const targetData = rawData.filter(item => getStr(item.purchaseDate).startsWith(selectedMonth));
    if (targetData.length === 0) return alert('해당 월에 엑셀로 저장할 데이터가 없습니다.');

    const headers = ['구매일', '계정주', '플랫폼', '상품명', '카톡방명', '페이백명', '기타메모(연락처)', '가격', '리뷰타입', 'AI리뷰내용', '작성완료', '상페완료', '리페완료'];
    
    const rows = targetData.map(row => [
      getStr(row.purchaseDate),
      getStr(row.accountHolder),
      getStr(row.platform),
      getStr(row.productName),
      getStr(row.chatRoomName),
      getStr(row.paybackName),
      getStr(row.contactOnBangpok),
      getNum(row.price),
      getStr(row.reviewType),
      getStr(row.generatedReview),
      row.isReviewWritten ? 'O' : 'X',
      row.isProductPayback ? 'O' : 'X',
      row.isReviewPayback ? 'O' : 'X',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `구매내역_정산_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxCount = Math.max(...stats.dailyCounts, 5); 
  const graphPoints = stats.dailyCounts.map((count, index) => {
    const x = (index / (stats.daysInMonth - 1)) * 1000;
    const y = 250 - (count / maxCount) * 200; 
    return `${x},${y}`;
  }).join(' ');

  if (!isLoaded) return <div className="opacity-0"></div>;

  return (
    <div className="animate-in fade-in duration-300 w-full max-w-5xl mx-auto space-y-6">
      
      {/* ✨ 통계 페이지: 플랫폼 바로가기 & 쿠팡 검색창 ✨ */}
      <div className="flex flex-col xl:flex-row justify-between items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-gray-200 w-full">
        <div className="flex flex-wrap gap-3 w-full xl:w-auto">
          {/* 쿠팡 */}
          <a href="https://link.coupang.com/a/hWThgSlpCu" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="data:image/png;base64,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" alt="Coupang" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-blue-700 text-sm transition-colors">🚀 쿠팡(할인)</span>
          </a>
          {/* 네이버 */}
          <a href="https://www.naver.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-400 hover:bg-green-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcBAMAAACAI8KnAAAAMFBMVEUeyAAAxQAAxADs+ev////6//m467Pi9uHD7r6x6KuC3XgmygrU89CQ4Iin5qHJ8cMfkHdFAAAAYUlEQVR4AWOgKRBSUgIRihAeo4mLKwNjiouzAIRb4uLSxDjFxR3B9RJE4bpsROUeQuX6PkHhunxB4voD+UhcvysoXE8dVK40KldwCQpXQALBNXFxE2AIgXoB6jclIEFLAAD2tiUhfIzieAAAAABJRU5ErkJggg==" alt="Naver" className="w-full h-full object-cover p-1" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">네이버</span>
          </a>
          {/* 지마켓 */}
          <a href="https://www.gmarket.co.kr/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-500 hover:bg-green-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="https://blog.kakaocdn.net/dna/UIGeR/btsrsRIruv5/AAAAAAAAAAAAAAAAAAAAADL-V5RuANqZCBbmB1nfPUBHhPnlaiQkiZjOsh2H8qCv/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1793458799&allow_ip=&allow_referer=&signature=5xg4LbafYGjRmlGtNYT2HKyoz6I%3D" alt="Gmarket" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">지마켓</span>
          </a>
          {/* 11번가 */}
          <a href="https://www.11st.co.kr/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-red-500 hover:bg-red-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="https://i.namu.wiki/i/Hoj-MVl7c1jGLFuXwYHtyTZ0GgGEvsOxKeJ2wNlqF6bEo9pvzGIgb0YN6bnNfoO-IufDLE0M2j0vRk8BJo042Ipo-hCiBsZ1ojt6AOJgmJ9-dFm-mVcySPxLowRzVHVyuZ-eJYkUnoloRdl6wIYsgg.svg" alt="11st" className="w-full h-full object-cover p-1" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-red-700 text-sm transition-colors">11번가</span>
          </a>
        </div>

        <div className="w-full xl:w-[300px] h-[75px] rounded-xl overflow-hidden flex items-center justify-center xl:justify-end border border-gray-100 shadow-sm flex-shrink-0">
          <iframe src="https://coupa.ng/cqe0B2" width="100%" height="75" frameBorder="0" scrolling="no" referrerPolicy="unsafe-url" title="쿠팡 상품 검색" className="w-full h-full"></iframe>
        </div>
      </div>

      {/* 🗓️ 월 선택 및 엑셀 다운로드 컨트롤러 */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-xl font-bold text-gray-800">📊 월간 통계 및 정산</h2>
        
        <div className="flex gap-3">
          <input 
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="p-2 px-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold text-gray-700 cursor-pointer bg-gray-50 hover:bg-white transition-colors"
          />
          {/* ✨ 엑셀 다운로드 버튼 추가 */}
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            📥 엑셀로 저장
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-gray-600 font-bold mb-6">{selectedMonth.replace('-', '년 ')}월 일별 작업 현황</h3>
        <div className="relative w-full h-[280px]">
          <svg viewBox="0 0 1000 280" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line key={ratio} x1="0" y1={250 - (200 * ratio)} x2="1000" y2={250 - (200 * ratio)} stroke="#f3f4f6" strokeWidth="2" />
            ))}
            <polyline fill="none" stroke="#9333ea" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={graphPoints} />
            {stats.dailyCounts.map((count, index) => {
              const x = (index / (stats.daysInMonth - 1)) * 1000;
              const y = 250 - (count / maxCount) * 200;
              return (
                <g key={index} className="group cursor-crosshair">
                  <circle cx={x} cy={y} r="6" fill="#fff" stroke="#9333ea" strokeWidth="3" className="transition-all group-hover:r-8 group-hover:fill-purple-100" />
                  <text x={x} y={y - 15} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#4b5563" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {count}건
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="absolute left-0 right-0 -bottom-2 flex justify-between px-1">
            {stats.dailyCounts.map((_, i) => (
              <span key={i} className={`text-xs text-gray-400 font-medium w-4 text-center ${(i + 1) % 5 !== 0 && i !== 0 && i !== stats.daysInMonth - 1 ? 'hidden md:block' : ''}`}>
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-transform hover:-translate-y-1">
          <span className="text-gray-500 text-sm font-bold mb-2">총 진행 건수</span>
          <div className="text-3xl font-extrabold text-gray-800">{stats.totalJobs.toLocaleString()}<span className="text-lg font-medium text-gray-500 ml-1">건</span></div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-transform hover:-translate-y-1">
          <span className="text-gray-500 text-sm font-bold mb-2">총 구매 비용</span>
          <div className="text-3xl font-extrabold text-red-500">{stats.totalCost.toLocaleString()}<span className="text-lg font-medium text-red-400 ml-1">원</span></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-200 flex flex-col justify-center relative overflow-hidden transition-transform hover:-translate-y-1">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 text-6xl">🔮</div>
          <span className="text-purple-600 text-sm font-bold mb-2">예상 순수익</span>
          <div className="text-3xl font-extrabold text-purple-700">{stats.estimatedProfit.toLocaleString()}<span className="text-lg font-medium text-purple-500 ml-1">원</span></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-200 flex flex-col justify-center relative overflow-hidden transition-transform hover:-translate-y-1">
           <div className="absolute right-[-10px] top-[-10px] opacity-10 text-6xl">💸</div>
          <span className="text-green-600 text-sm font-bold mb-2">실제 수익 (페이백 완료)</span>
          <div className="text-3xl font-extrabold text-green-700">{stats.actualProfit.toLocaleString()}<span className="text-lg font-medium text-green-500 ml-1">원</span></div>
        </div>
      </div>

      {/* ✨ 통계 페이지 하단 전용 쿠팡 배너 영역 ✨ */}
      <StatsCoupangBanner />

    </div>
  );
}