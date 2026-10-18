'use client';

import { useState, useEffect, useRef } from 'react';
import { addPurchase, updatePurchase, deletePurchase, deletePurchases, duplicatePurchase, getPaginatedPurchases } from '@/app/actions/purchase';
import { generateAiReview } from '@/app/actions/ai';

// 🛡️ 절대 안 터지는 안전 변환 함수들
const getStr = (val: any) => (val === null || val === undefined) ? '' : String(val);
const getNum = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

// ✨ 리액트 환경에서 완벽하게 격리된 쿠팡 파트너스 전용 컴포넌트 (iframe 샌드박스)
const CoupangBanner = () => {
  const iframeHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            background-color: #f9fafb; /* 배경색 맞춤 (gray-50) */
          }
        </style>
      </head>
      <body>
        <script src="https://ads-partners.coupang.com/g.js"></script>
        <script>
          new PartnersCoupang.G({"id":1040729,"template":"carousel","trackingCode":"AF5941029","width":"680","height":"140","tsource":""});
        </script>
      </body>
    </html>
  `;

  return (
    <div className="w-full flex justify-center overflow-hidden">
      <iframe
        srcDoc={iframeHtml}
        width="680"
        height="140"
        frameBorder="0"
        scrolling="no"
        className="max-w-full"
        style={{ border: 'none', backgroundColor: 'transparent' }}
      />
    </div>
  );
};

export default function PurchaseTable({ accounts = [], hasApiKey }: { accounts: any[], hasApiKey?: boolean }) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchField, setSearchField] = useState('productName');
  const [searchInput, setSearchInput] = useState(''); 
  const [appliedSearch, setAppliedSearch] = useState(''); 
  const [localData, setLocalData] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [hideSpinner, setHideSpinner] = useState(false);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [modalReview, setModalReview] = useState<{id: string, text: string} | null>(null);
  
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const cancelBulkRef = useRef(false);
  const [isAdding, setIsAdding] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await getPaginatedPurchases({
        page: currentPage, pageSize: 100, searchField, searchKeyword: appliedSearch, isCompleted: activeTab === 'completed'
      });
      setLocalData(data.items || []);
      setTotalPages(data.totalPages || 1);
      setSelectedRows(new Set()); 
    } catch (error) {
      console.error('데이터 불러오기 실패:', error);
    } finally {
      setIsLoading(false);
      setHideSpinner(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentPage, appliedSearch, activeTab]);

  const executeSearch = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setCurrentPage(1); 
    setAppliedSearch(searchInput);
  };

  const changeTab = (e: React.MouseEvent, tab: 'progress' | 'completed') => {
    e.preventDefault();
    if (activeTab === tab) return;
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchInput('');
    setAppliedSearch('');
  };

  const handleLocalChange = (id: string, field: string, value: any) => {
    setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); 
    e.stopPropagation();
    setEditingRows(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleCheckChange = async (id: string, field: string, value: boolean) => {
    const row = localData.find(r => r.id === id);
    if (!row) return;

    const updatedRow = { ...row, [field]: value };
    const isNowCompleted = updatedRow.isReviewWritten && updatedRow.isProductPayback && updatedRow.isReviewPayback;
    const shouldVanish = (activeTab === 'progress' && isNowCompleted) || (activeTab === 'completed' && !isNowCompleted);

    if (shouldVanish) setLocalData(prev => prev.filter(r => r.id !== id));
    else setLocalData(prev => prev.map(r => r.id === id ? updatedRow : r));

    try { await updatePurchase(id, { [field]: value }); } 
    catch (e) { alert('상태 업데이트에 실패했습니다.'); fetchData(); }
  };

  const handleCopy = async (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    await navigator.clipboard.writeText(text);
    alert('복사되었습니다!');
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedRows.size === localData.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(localData.map(r => r.id)));
  };

  const handleGenerateAi = async (e: React.MouseEvent, id: string, productName: string) => {
    e.preventDefault();
    
    if (!hasApiKey) {
      alert("api키가 입력 되지않았습니다. gemini api 키 설정 화면을 참고해 api 키를 입력해주세요");
      return;
    }

    try {
      const generatedText = await generateAiReview(id, productName);
      setLocalData(prev => prev.map(r => r.id === id ? { ...r, generatedReview: generatedText } : r));
      await updatePurchase(id, { generatedReview: generatedText });
    } catch (e: any) { 
      const errorMsg = e?.message?.toLowerCase() || String(e).toLowerCase();
      let reason = '알 수 없는 오류';
      if (errorMsg.includes('safety') || errorMsg.includes('policy') || errorMsg.includes('violation')) reason = '보안 정책 위반(성인용품 등)';
      else if (errorMsg.includes('quota') || errorMsg.includes('429')) reason = '요청 한도 초과';
      
      alert(`AI 리뷰 생성에 실패했습니다.\n사유: ${reason}`); 
    }
  };

  const handleBulkGenerateAi = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!hasApiKey) {
      alert("api키가 입력 되지않았습니다. gemini api 키 설정 화면을 참고해 api 키를 입력해주세요");
      return;
    }

    const targets = localData.filter(r => r.reviewType === '(빈)텍스트' && !r.generatedReview && (r.productName || '').trim() !== '');
    if (targets.length === 0) return alert('현재 화면에 생성할 대상이 없습니다.');
    
    let uniqueProductNames = Array.from(new Set(targets.map(t => getStr(t.productName).trim())));
    if (uniqueProductNames.length > 15) {
      alert(`최대 15개 먼저 생성합니다. 완료 후 다시 눌러주세요.`);
      uniqueProductNames = uniqueProductNames.slice(0, 15);
    }
    if (!confirm(`총 [${uniqueProductNames.length}개] 고유 상품명에 대해 AI 생성을 시작합니다.`)) return;

    setIsBulkGenerating(true);
    cancelBulkRef.current = false;
    
    const failedProducts: { name: string, reason: string }[] = [];

    for (let i = 0; i < uniqueProductNames.length; i++) {
      if (cancelBulkRef.current) break;
      const currentProductName = uniqueProductNames[i];
      setBulkProgress({ current: i + 1, total: uniqueProductNames.length });
      
      try {
        const matchingRows = targets.filter(t => getStr(t.productName).trim() === currentProductName);
        const sampleId = matchingRows[0].id;
        const generatedText = await generateAiReview(sampleId, currentProductName);
        
        const otherRows = matchingRows.slice(1);
        for (const row of otherRows) { await updatePurchase(row.id, { ...row, generatedReview: generatedText }); }
        setLocalData(prev => prev.map(r => (r.reviewType === '(빈)텍스트' && !r.generatedReview && getStr(r.productName).trim() === currentProductName) ? { ...r, generatedReview: generatedText } : r));
      } catch (e: any) { 
        const errorMsg = e?.message?.toLowerCase() || String(e).toLowerCase();
        let userFriendlyReason = "알 수 없는 시스템 오류 (잠시 후 다시 시도)";

        if (errorMsg.includes('safety') || errorMsg.includes('policy') || errorMsg.includes('violation')) {
          userFriendlyReason = "제미나이 보안 정책 위반 (성인용품, 폭력성 단어 등)";
        } else if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('too many')) {
          userFriendlyReason = "API 분당 요청 한도 초과 (잠시 후 다시 시도)";
        } else if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('timeout')) {
          userFriendlyReason = "네트워크 연결 지연 (잠시 후 다시 시도)";
        }

        failedProducts.push({ name: currentProductName, reason: userFriendlyReason });
      }
      
      if (i < uniqueProductNames.length - 1 && !cancelBulkRef.current) await new Promise(res => setTimeout(res, 5000));
    }
    
    setIsBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0 });

    if (failedProducts.length > 0) {
      const failedListStr = failedProducts.map(f => `- ${f.name}\n  (사유: ${f.reason})`).join('\n\n');
      alert(`✅ 작업이 완료되었으나, 다음 ${failedProducts.length}개 상품은 실패했습니다.\n\n[실패 목록 및 사유]\n${failedListStr}\n\n사유를 확인하신 후 개별 AI 생성 버튼으로 다시 시도하시거나, 보안 위반 상품은 직접 작성해 주세요.`);
    } else {
      if (!cancelBulkRef.current) alert('✅ 요청하신 AI 리뷰 생성이 완벽하게 완료되었습니다!');
    }
  };

  const handleSave = async (e: React.MouseEvent, row: any) => {
    e.preventDefault();
    if (getStr(row.id).startsWith('temp-')) return alert('서버에 생성 중입니다. 잠시 후 시도해주세요.');
    const prev = [...localData];
    setEditingRows(p => { const n = new Set(p); n.delete(row.id); return n; });
    try {
      const { memo, ...safeData } = row;
      safeData.price = parseInt(safeData.price) || 0; 
      await updatePurchase(row.id, safeData);
      
      setLocalData(curr => curr.map(r => r.id === row.id ? { ...r, price: safeData.price } : r));
    } catch (e) { setLocalData(prev); alert('수정 실패'); }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm('정말 삭제하시겠습니까?')) return;
    setLocalData(prev => prev.filter(item => item.id !== id));
    try { await deletePurchase(id); } catch (e) { fetchData(); }
  };

  const handleBulkDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedRows.size === 0 || !confirm(`${selectedRows.size}개 삭제하시겠습니까?`)) return;
    const ids = Array.from(selectedRows);
    setLocalData(prev => prev.filter(item => !ids.includes(item.id)));
    setSelectedRows(new Set());
    try { await deletePurchases(ids); } catch (e) { fetchData(); }
  };

  const handleDuplicate = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const rowToDuplicate = localData.find(r => r.id === id);
    if (!rowToDuplicate) return;
    const tempId = `temp-${Date.now()}`;
    setLocalData(prev => {
      const index = prev.findIndex(item => item.id === id);
      const newData = [...prev];
      newData.splice(index, 0, { ...rowToDuplicate, id: tempId });
      return newData;
    });
    try {
      const newSaved = await duplicatePurchase(id);
      setLocalData(prev => prev.map(item => item.id === tempId ? newSaved : item));
    } catch (e) { fetchData(); }
  };

  const handleAddRow = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setHideSpinner(true);
    try {
      const addedRows = await addPurchase();
      
      if (addedRows && Array.isArray(addedRows)) {
        setEditingRows(prev => {
          const next = new Set(prev);
          addedRows.forEach((row: any) => next.add(row.id));
          return next;
        });
      }

      if (activeTab === 'progress' && currentPage === 1) {
        await fetchData(); 
      } else {
        setActiveTab('progress');
        setCurrentPage(1);
      }
    } catch (e) { 
      alert('추가 실패'); 
      setHideSpinner(false); 
    } 
    finally { 
      setIsAdding(false); 
    }
  };

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      <div className="flex border-b bg-gray-100">
        <button type="button" onClick={(e) => changeTab(e, 'progress')} className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'progress' ? 'bg-white text-purple-700 border-t-2 border-t-purple-600' : 'text-gray-500 hover:bg-gray-50'}`}>🔥 진행 중 내역</button>
        <button type="button" onClick={(e) => changeTab(e, 'completed')} className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'completed' ? 'bg-white text-green-700 border-t-2 border-t-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>✅ 완료 내역</button>
      </div>

      <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4 justify-between items-center bg-gray-50">
        <div className="flex items-center gap-2">
          <select value={searchField} onChange={e => setSearchField(e.target.value)} className="p-2 border rounded-lg outline-none text-sm bg-white">
            <option value="productName">상품명</option>
            <option value="purchaseDate">구매일</option>
            <option value="accountHolder">계정주</option>
            <option value="platform">플랫폼</option>
            <option value="chatRoomName">카톡방명</option>
            <option value="paybackName">페이백명</option>
          </select>
          <input 
            type="text" value={searchInput} 
            onChange={e => setSearchInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && executeSearch()}
            placeholder="검색어 입력 후 엔터" 
            className="p-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm w-[200px]"
          />
          <button type="button" onClick={executeSearch} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-700">검색</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleBulkGenerateAi} disabled={isLoading || isBulkGenerating || isAdding} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50">✨ 전체 AI 생성</button>
          <button type="button" onClick={handleBulkDelete} disabled={selectedRows.size === 0} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">🗑️ 선택 삭제</button>
          <button type="button" onClick={handleAddRow} disabled={isAdding} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 w-[130px]">
            {isAdding ? '⏳ 추가 중...' : '새 항목 5줄 추가'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto min-h-[400px] relative">
        {isLoading && !hideSpinner && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-purple-500 border-t-transparent"></div>
          </div>
        )}
        <table className="w-full text-sm text-left whitespace-nowrap">
           <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs sticky top-0 z-0">
            <tr>
              <th className="px-2 py-3 border-r text-center w-[90px]">구매일</th>
              <th className="px-2 py-3 border-r w-[90px] text-center">계정주</th>
              <th className="px-2 py-3 border-r w-[80px] text-center">플랫폼</th>
              <th className="px-2 py-3 border-r w-[140px] text-center">상품명</th>
              <th className="px-2 py-3 border-r w-[130px] text-center">카톡방명</th>
              <th className="px-2 py-3 border-r w-[100px] text-center">페이백명</th>
              <th className="px-2 py-3 border-r w-[120px] text-center">기타 메모</th>
              <th className="px-2 py-3 border-r w-[80px] text-center">가격</th>
              <th className="px-2 py-3 border-r w-[100px] text-center">리뷰 타입</th>
              <th className="px-2 py-3 border-r w-[80px] text-center">AI 리뷰</th>
              <th className="px-1 py-3 border-r text-center w-[40px]">작성</th>
              <th className="px-1 py-3 border-r text-center w-[40px]">상페</th>
              <th className="px-1 py-3 border-r text-center w-[40px]">리페</th>
              <th className="px-2 py-3 border-r text-center w-[130px]">작업</th>
              <th className="px-2 py-3 text-center w-[40px]">
                <input type="checkbox" onChange={toggleAllSelection} checked={localData.length > 0 && selectedRows.size === localData.length} className="w-4 h-4 rounded cursor-pointer accent-red-500" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {localData.length === 0 && !isLoading ? (
              <tr><td colSpan={15} className="px-4 py-16 text-center text-gray-500 font-medium bg-gray-50/50">표시할 데이터가 없습니다.</td></tr>
            ) : (
              localData.map((row) => {
                const isEditing = editingRows.has(row.id);
                const isSelected = selectedRows.has(row.id);
                const isWritten = row.isReviewWritten || false;
                const isProductPayback = row.isProductPayback || false;
                const isReviewPayback = row.isReviewPayback || false;
                const writtenBg = isWritten ? 'bg-blue-100' : '';
                const productBg = isProductPayback ? 'bg-blue-100' : (isWritten ? 'bg-red-100' : '');
                const reviewBg = isReviewPayback ? 'bg-blue-100' : (isWritten ? 'bg-red-100' : '');
                const rowBg = isSelected ? 'bg-red-50/40' : (isEditing ? 'bg-yellow-50/30' : 'hover:bg-blue-50/20');

                return (
                  <tr key={row.id} className={`${rowBg} transition-colors`}>
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="date" value={getStr(row.purchaseDate)} onChange={(e) => handleLocalChange(row.id, 'purchaseDate', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 text-xs">{getStr(row.purchaseDate)}</div>}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select value={getStr(row.accountHolder)} onChange={(e) => handleLocalChange(row.id, 'accountHolder', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white">
                          <option value="">선택 안됨</option>
                          {safeAccounts.map((acc, idx) => (
                            <option key={`acc-${idx}`} value={getStr(acc?.accountHolder)}>{getStr(acc?.accountHolder) || '이름 없음'}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="py-2 px-1 truncate max-w-[90px] mx-auto text-xs">{getStr(row.accountHolder) || '-'}</div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={getStr(row.platform)} onChange={(e) => handleLocalChange(row.id, 'platform', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[80px] mx-auto text-xs">{getStr(row.platform) || '-'}</div>}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={getStr(row.productName)} onChange={(e) => handleLocalChange(row.id, 'productName', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs" /> : <div className="py-2 px-1 truncate max-w-[140px] mx-auto text-xs" title={getStr(row.productName)}>{getStr(row.productName) || '-'}</div>}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={getStr(row.chatRoomName)} onChange={(e) => handleLocalChange(row.id, 'chatRoomName', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs" /> : <div className="py-2 px-1 truncate max-w-[130px] mx-auto text-xs" title={getStr(row.chatRoomName)}>{getStr(row.chatRoomName) || '-'}</div>}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={getStr(row.paybackName)} onChange={(e) => handleLocalChange(row.id, 'paybackName', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[100px] mx-auto text-xs" title={getStr(row.paybackName)}>{getStr(row.paybackName) || '-'}</div>}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={getStr(row.contactOnBangpok)} onChange={(e) => handleLocalChange(row.id, 'contactOnBangpok', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[120px] mx-auto text-xs" title={getStr(row.contactOnBangpok)}>{getStr(row.contactOnBangpok) || '-'}</div>}
                    </td>
                    <td className="p-1 border-r text-right">
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={row.price === 0 ? '' : (row.price || '')} 
                          onChange={(e) => handleLocalChange(row.id, 'price', e.target.value.replace(/[^0-9]/g, ''))} 
                          placeholder="가격" 
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-right text-xs" 
                        />
                      ) : (
                        <div className="py-2 px-1 text-xs">{row.price ? Number(row.price).toLocaleString() : ''}</div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select value={getStr(row.reviewType) || '(빈)별점'} onChange={(e) => handleLocalChange(row.id, 'reviewType', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white">
                          <option value="(빈)별점">(빈)별점</option><option value="(빈)텍스트">(빈)텍스트</option><option value="(빈)원고제공">(빈)원고제공</option><option value="실배">실배</option>
                        </select>
                      ) : <div className="py-2 px-1 text-xs text-center">{getStr(row.reviewType) || '-'}</div>}
                    </td>
                    <td className="p-1 border-r text-center align-middle">
                      <div className="flex flex-col gap-1.5 px-1">
                        {row.reviewType === '(빈)텍스트' ? (
                          !row.generatedReview ? (
                            <button type="button" onClick={(e) => handleGenerateAi(e, row.id, row.productName)} className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full">생성</button>
                          ) : (
                            <button type="button" onClick={(e) => { e.preventDefault(); setModalReview({ id: row.id, text: getStr(row.generatedReview) }); }} className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full">📄 보기</button>
                          )
                        ) : (
                          <span className="text-gray-400 text-[11px] block text-center py-1.5">-</span>
                        )}
                      </div>
                    </td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${writtenBg}`}><input type="checkbox" checked={isWritten} onChange={(e) => handleCheckChange(row.id, 'isReviewWritten', e.target.checked)} className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer" /></td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${productBg}`}><input type="checkbox" checked={isProductPayback} onChange={(e) => handleCheckChange(row.id, 'isProductPayback', e.target.checked)} className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer" /></td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${reviewBg}`}><input type="checkbox" checked={isReviewPayback} onChange={(e) => handleCheckChange(row.id, 'isReviewPayback', e.target.checked)} className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer" /></td>
                    <td className="px-1 py-3 border-r text-center">
                      <div className="flex gap-1 justify-center">
                        {isEditing ? (
                          <button type="button" onClick={(e) => handleSave(e, row)} className="px-2 py-1 bg-green-500 text-white rounded font-medium hover:bg-green-600 text-xs transition-colors">저장</button>
                        ) : (
                          <button type="button" onClick={(e) => handleEdit(e, row.id)} className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium hover:bg-blue-100 text-xs transition-colors">수정</button>
                        )}
                        <button type="button" onClick={(e) => handleDuplicate(e, row.id)} className="px-2 py-1 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded font-medium hover:bg-yellow-100 text-xs transition-colors">복제</button>
                        <button type="button" onClick={(e) => handleDelete(e, row.id)} className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded font-medium hover:bg-red-100 text-xs transition-colors">삭제</button>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center align-middle bg-gray-50 border-l border-gray-200">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRowSelection(row.id)} className="w-5 h-5 cursor-pointer accent-red-500" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center items-center py-4 bg-white border-t gap-2">
        <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold">이전</button>
        <span className="text-sm font-bold text-gray-600 px-4">{currentPage} / {totalPages} 페이지</span>
        <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold">다음</button>
      </div>

      {/* ✨ 쿠팡 파트너스 배너 및 필수 고지 문구 삽입 영역 ✨ */}
      <div className="py-8 bg-gray-50 flex flex-col items-center justify-center border-t border-gray-200 px-4 rounded-b-xl">
        <CoupangBanner />
        <p className="mt-4 text-[11px] text-gray-400 tracking-tight text-center font-medium">
          "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
        </p>
      </div>

      {modalReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">📄 AI 리뷰 확인</h3>
              <button type="button" onClick={() => setModalReview(null)} className="text-gray-400 hover:text-gray-600 font-bold text-xl">✕</button>
            </div>
            <textarea
              value={modalReview.text}
              onChange={(e) => {
                setModalReview({ ...modalReview, text: e.target.value });
                setLocalData(prev => prev.map(r => r.id === modalReview.id ? { ...r, generatedReview: e.target.value } : r));
              }}
              readOnly={!editingRows.has(modalReview.id)}
              className={`w-full h-48 p-4 border rounded-lg text-sm resize-none outline-none ${editingRows.has(modalReview.id) ? 'border-blue-400 focus:ring-2 focus:ring-blue-500 bg-white' : 'border-gray-200 bg-gray-50'}`}
              placeholder="리뷰 텍스트가 없습니다."
            />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={(e) => handleCopy(e, modalReview.text)} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors">복사하기</button>
              <button type="button" onClick={() => setModalReview(null)} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">닫기</button>
            </div>
          </div>
        </div>
      )}

      {isBulkGenerating && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">AI 리뷰 전체 생성 중...</h3>
            <p className="text-gray-500 text-sm mb-6 text-center">
              API 최적화를 위해 고유 상품명 단위로 생성됩니다.<br/>
              <span className="font-bold text-purple-600 mt-2 block text-lg">({bulkProgress.current} / {bulkProgress.total})</span>
            </p>
            <button type="button" onClick={() => { cancelBulkRef.current = true; }} className="px-6 py-2 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-lg transition-colors w-full">생성 취소</button>
          </div>
        </div>
      )}
    </div>
  );
}