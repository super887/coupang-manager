'use client';

import { useState, useEffect, useMemo } from 'react';
import { getStatsData } from '@/app/actions/stats';

const getStr = (val: any) => (val === null || val === undefined) ? '' : String(val);
const getNum = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

export default function StatsClientWrapper() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // 현재 날짜 기준으로 기본 월 세팅 (예: "2026-10")
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);

  useEffect(() => {
    // ✨ 로컬 캐싱: 브라우저에 저장된 통계 데이터로 즉시 화면 렌더링 (0초 컷)
    const cached = localStorage.getItem('optimistic_stats');
    if (cached) setRawData(JSON.parse(cached));
    setIsLoaded(true);

    // ✨ 화면 띄운 후 최신 데이터 동기화
    const fetchLatest = async () => {
      try {
        const data = await getStatsData();
        setRawData(data || []);
        localStorage.setItem('optimistic_stats', JSON.stringify(data || []));
      } catch (e) {
        console.error('통계 동기화 실패', e);
      }
    };
    fetchLatest();
  }, []);

  // 🚀 선택된 월에 맞춰 데이터 정산 (월 변경 시 프론트엔드에서 즉시 재계산)
  const stats = useMemo(() => {
    if (!selectedMonth) return { totalJobs: 0, totalCost: 0, estimatedProfit: 0, actualProfit: 0, dailyCounts: [], daysInMonth: 30 };

    const [year, month] = selectedMonth.split('-');
    // 해당 월의 마지막 날짜 구하기 (28, 30, 31일)
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    
    let totalJobs = 0;
    let totalCost = 0;
    let estimatedProfit = 0;
    let actualProfit = 0;
    
    // 그래프를 위한 일별 데이터 배열 (1일~말일)
    const dailyCounts = Array.from({ length: daysInMonth }, () => 0);

    rawData.forEach(item => {
      const dateStr = getStr(item.purchaseDate);
      if (!dateStr.startsWith(selectedMonth)) return; // 선택한 월의 데이터만 쏙 필터링

      const day = parseInt(dateStr.split('-')[2], 10);
      if (day >= 1 && day <= daysInMonth) {
        dailyCounts[day - 1] += 1;
      }

      totalJobs += 1;
      totalCost += getNum(item.price);

      // ✨ 형님의 수익 계산 공식 완벽 적용
      let profit = 0;
      const rType = getStr(item.reviewType);
      if (rType === '(빈)별점') profit = 500;
      else if (rType === '(빈)텍스트' || rType === '(빈)원고제공') profit = 1000;
      // 실배 등 나머지는 0원

      estimatedProfit += profit;
      
      // 리뷰비 페이백이 체크된 항목만 실제 수익으로 합산
      if (item.isReviewPayback) {
        actualProfit += profit; 
      }
    });

    return { totalJobs, totalCost, estimatedProfit, actualProfit, dailyCounts, daysInMonth };
  }, [rawData, selectedMonth]);

  // 📈 SVG 선 그래프 포인트 자동 계산
  const maxCount = Math.max(...stats.dailyCounts, 5); // 데이터가 없어도 그래프 틀 유지 (최소 높이 5)
  const graphPoints = stats.dailyCounts.map((count, index) => {
    const x = (index / (stats.daysInMonth - 1)) * 1000;
    const y = 250 - (count / maxCount) * 200; // y축 여백(padding) 고려
    return `${x},${y}`;
  }).join(' ');

  if (!isLoaded) return <div className="opacity-0"></div>;

  return (
    <div className="animate-in fade-in duration-300 w-full max-w-5xl mx-auto space-y-6">
      
      {/* 🗓️ 월 선택 컨트롤러 */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">📊 월간 통계 및 정산</h2>
        <input 
          type="month" 
          value={selectedMonth} 
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="p-2 px-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold text-gray-700 cursor-pointer bg-gray-50 hover:bg-white transition-colors"
        />
      </div>

      {/* 📈 자체 제작 무설치 SVG 반응형 선 그래프 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-gray-600 font-bold mb-6">{selectedMonth.replace('-', '년 ')}월 일별 작업 현황</h3>
        <div className="relative w-full h-[280px]">
          <svg viewBox="0 0 1000 280" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            {/* 배경 가이드 라인 5줄 */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line key={ratio} x1="0" y1={250 - (200 * ratio)} x2="1000" y2={250 - (200 * ratio)} stroke="#f3f4f6" strokeWidth="2" />
            ))}
            
            {/* 데이터 연결선 (Line) */}
            <polyline fill="none" stroke="#9333ea" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={graphPoints} />
            
            {/* 데이터 포인트 (Dots) 및 호버 시 나오는 툴팁 */}
            {stats.dailyCounts.map((count, index) => {
              const x = (index / (stats.daysInMonth - 1)) * 1000;
              const y = 250 - (count / maxCount) * 200;
              return (
                <g key={index} className="group cursor-crosshair">
                  <circle cx={x} cy={y} r="6" fill="#fff" stroke="#9333ea" strokeWidth="3" className="transition-all group-hover:r-8 group-hover:fill-purple-100" />
                  {/* 마우스 오버 툴팁 */}
                  <text x={x} y={y - 15} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#4b5563" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {count}건
                  </text>
                </g>
              );
            })}
          </svg>

          {/* X축 날짜 텍스트 (모바일에서는 너무 촘촘해지지 않게 5일 간격으로 자동 조절) */}
          <div className="absolute left-0 right-0 -bottom-2 flex justify-between px-1">
            {stats.dailyCounts.map((_, i) => (
              <span key={i} className={`text-xs text-gray-400 font-medium w-4 text-center ${(i + 1) % 5 !== 0 && i !== 0 && i !== stats.daysInMonth - 1 ? 'hidden md:block' : ''}`}>
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 💰 월간 요약 정산 보드 (4구역) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* 구역 1: 총 진행 건수 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-transform hover:-translate-y-1">
          <span className="text-gray-500 text-sm font-bold mb-2">총 진행 건수</span>
          <div className="text-3xl font-extrabold text-gray-800">{stats.totalJobs.toLocaleString()}<span className="text-lg font-medium text-gray-500 ml-1">건</span></div>
        </div>
        
        {/* 구역 2: 총 구매 비용 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-transform hover:-translate-y-1">
          <span className="text-gray-500 text-sm font-bold mb-2">총 구매 비용</span>
          <div className="text-3xl font-extrabold text-red-500">{stats.totalCost.toLocaleString()}<span className="text-lg font-medium text-red-400 ml-1">원</span></div>
        </div>

        {/* 구역 3: 예상 순수익 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-200 flex flex-col justify-center relative overflow-hidden transition-transform hover:-translate-y-1">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 text-6xl">🔮</div>
          <span className="text-purple-600 text-sm font-bold mb-2">예상 순수익</span>
          <div className="text-3xl font-extrabold text-purple-700">{stats.estimatedProfit.toLocaleString()}<span className="text-lg font-medium text-purple-500 ml-1">원</span></div>
        </div>

        {/* 구역 4: 실제 수익 (페이백 체크) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-200 flex flex-col justify-center relative overflow-hidden transition-transform hover:-translate-y-1">
           <div className="absolute right-[-10px] top-[-10px] opacity-10 text-6xl">💸</div>
          <span className="text-green-600 text-sm font-bold mb-2">실제 수익 (페이백 완료)</span>
          <div className="text-3xl font-extrabold text-green-700">{stats.actualProfit.toLocaleString()}<span className="text-lg font-medium text-green-500 ml-1">원</span></div>
        </div>

      </div>

    </div>
  );
}