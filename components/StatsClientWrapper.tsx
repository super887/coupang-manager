'use client';

import { useState, useEffect, useMemo } from 'react';
import { getStatsData } from '@/app/actions/stats';

const getStr = (val: any) => (val === null || val === undefined) ? '' : String(val);
const getNum = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

export default function StatsClientWrapper() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);

  useEffect(() => {
    const cached = localStorage.getItem('optimistic_stats');
    if (cached) setRawData(JSON.parse(cached));
    setIsLoaded(true);

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

  // ✨ 라이브러리 없이 엑셀(CSV)을 즉석에서 찍어내는 완벽한 방탄 함수
  const handleExportExcel = () => {
    // 1. 현재 선택된 월의 데이터만 필터링
    const targetData = rawData.filter(item => getStr(item.purchaseDate).startsWith(selectedMonth));
    if (targetData.length === 0) return alert('해당 월에 엑셀로 저장할 데이터가 없습니다.');

    // 2. 엑셀 헤더 설정
    const headers = ['구매일', '계정주', '플랫폼', '상품명', '카톡방명', '페이백명', '기타메모(연락처)', '가격', '리뷰타입', 'AI리뷰내용', '작성완료', '상페완료', '리페완료'];
    
    // 3. 데이터를 엑셀 행(Row) 규격에 맞게 변환
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

    // 4. 쉼표나 따옴표가 내용에 들어가도 표가 깨지지 않게 이스케이프 처리
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // 5. 한글 깨짐 방지(BOM 문자 '\uFEFF' 추가) 후 다운로드 트리거
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `구매내역_정산_${selectedMonth}.csv`); // 파일명 예시: 구매내역_정산_2026-10.csv
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
    </div>
  );
}