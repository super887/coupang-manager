'use client';

import { useState, useEffect, useRef } from 'react';
import { addPurchase, updatePurchase, deletePurchase, deletePurchases, duplicatePurchase, getPaginatedPurchases } from '@/app/actions/purchase';
import { generateAiReview } from '@/app/actions/ai';

export default function PurchaseTable({ accounts = [] }: { accounts: any[] }) {
  // ✨ 핵심 방어막: accounts가 정상적인 배열이 아니면 강제로 빈 배열[]로 만들어버림 (절대 안 터짐)
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  // --- 페이징, 검색, 탭 상태 관리 ---
  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [searchField, setSearchField] = useState('productName');
  const [searchInput, setSearchInput] = useState(''); 
  const [appliedSearch, setAppliedSearch] = useState(''); 
  
  const [localData, setLocalData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- 기존 상태 관리 ---
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [modalReview, setModalReview] = useState<{id: string, text: string} | null>(null);
  
  // AI 생성 상태
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const cancelBulkRef = useRef(false);
  const [isAdding, setIsAdding] = useState(false);

  // 🚀 데이터 불러오기 로직
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await getPaginatedPurchases({
        page: currentPage,
        pageSize: 100, 
        searchField: searchField,
        searchKeyword: appliedSearch,
        isCompleted: activeTab === 'completed'
      });
      setLocalData(data.items);
      setTotalPages(data.totalPages || 1);
      setSelectedRows(new Set()); 
    } catch (error) {
      console.error('데이터 불러오기 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, appliedSearch, activeTab]);

  const executeSearch = () => {
    setCurrentPage(1); 
    setAppliedSearch(searchInput);
  };

  const changeTab = (tab: 'progress' | 'completed') => {
    if (activeTab === tab) return;
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchInput('');
    setAppliedSearch('');
  };

  const handleLocalChange = (id: string, field: string, value: any) => {
    setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleEdit = (id: string) => {
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

    try {
      await updatePurchase(id, { [field]: value });
    } catch (e) {
      alert('상태 업데이트에 실패했습니다.');
      fetchData(); 
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    alert('복사되었습니다!');
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedRows.size === localData.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(localData.map(r => r.id)));
  };

  const handleGenerateAi = async (id: string, productName: string) => {
    try {
      const generatedText = await generateAiReview(id, productName);
      setLocalData(prev => prev.map(r => r.id === id ? { ...r, generatedReview: generatedText } : r));
      await updatePurchase(id, { generatedReview: generatedText });
    } catch (e) {
      alert('AI 리뷰 생성에 실패했습니다.');
    }
  };

  const handleBulkGenerateAi = async () => {
    const targets = localData.filter(r => r.reviewType === '(빈)텍스트' && !r.generatedReview && (r.productName || '').trim() !== '');
    if (targets.length === 0) return alert('현재 화면에 생성할 대상이 없습니다.\n(조건: (빈)텍스트 + 생성된 리뷰 없음 + 상품명 입력됨)');
    
    let uniqueProductNames = Array.from(new Set(targets.map(t => t.productName.trim())));
    if (uniqueProductNames.length > 15) {
      alert(`구글 AI의 분당 최대 생성 한도(15개)를 초과하여, 먼저 15개의 상품에 대해서만 리뷰를 생성합니다.\n\n완료 후 다시 버튼을 눌러주세요!`);
      uniqueProductNames = uniqueProductNames.slice(0, 15);
    }
    if (!confirm(`현재 화면의 총 [${uniqueProductNames.length}개] 고유 상품명에 대해 AI 생성을 시작합니다.\n(안전한 생성을 위해 약 ${uniqueProductNames.length * 5}초가 소요됩니다)`)) return;

    setIsBulkGenerating(true);
    cancelBulkRef.current = false;
    
    for (let i = 0; i < uniqueProductNames.length; i++) {
      if (cancelBulkRef.current) { alert('생성 작업이 취소되었습니다.'); break; }
      
      const currentProductName = uniqueProductNames[i];
      setBulkProgress({ current: i + 1, total: uniqueProductNames.length });
      
      try {
        const matchingRows = targets.filter(t => t.productName.trim() === currentProductName);
        const sampleId = matchingRows[0].id;
        const generatedText = await generateAiReview(sampleId, currentProductName);
        const otherRows = matchingRows.slice(1);
        
        for (const row of otherRows) {
          await updatePurchase(row.id, { ...row, generatedReview: generatedText });
        }
        setLocalData(prev => prev.map(r => (r.reviewType === '(빈)텍스트' && !r.generatedReview && r.productName.trim() === currentProductName) ? { ...r, generatedReview: generatedText } : r));
      } catch (e) { 
        alert(`앗! '${currentProductName}' 생성 중 에러가 발생했습니다.`);
        break; 
      }
      if (i < uniqueProductNames.length - 1 && !cancelBulkRef.current) await new Promise(res => setTimeout(res, 5000));
    }
    
    setIsBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0 });
    alert('✅ 요청하신 AI 리뷰 생성이 완료되었습니다!');
  };

  const handleSave = async (row: any) => {
    if (row.id.startsWith('temp-')) return alert('서버에 생성 중입니다. 잠시 후 시도해주세요.');
    const prev = [...localData];
    setEditingRows(p => { const n = new Set(p); n.delete(row.id); return n; });
    try {
      const { memo, ...safeData } = row;
      await updatePurchase(row.id, safeData);
    } catch (e) {
      setLocalData(prev);
      alert('수정 실패');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    setLocalData(prev => prev.filter(item => item.id !== id));
    try { await deletePurchase(id); } catch (e) { fetchData(); }
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0 || !confirm(`${selectedRows.size}개 삭제하시겠습니까?`)) return;
    const ids = Array.from(selectedRows);
    setLocalData(prev => prev.filter(item => !ids.includes(item.id)));
    setSelectedRows(new Set());
    try { await deletePurchases(ids); } catch (e) { fetchData(); }
  };

  const handleDuplicate = async (id: string) => {
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

  const handleAddRow = async () => {
    setIsAdding(true);
    try {
      await addPurchase();
      setActiveTab('progress');
      setCurrentPage(1);
      fetchData(); 
    } catch (e) { alert('추가 실패'); } 
    finally { setIsAdding(false); }
  };

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      
      {/* 탭 네비게이션 */}
      <div className="flex border-b bg-gray-100">
        <button type="button" onClick={() => changeTab('progress')} className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'progress' ? 'bg-white text-purple-700 border-t-2 border-t-purple-600' : 'text-gray-500 hover:bg-gray-50'}`}>🔥 진행 중 내역</button>
        <button type="button" onClick={() => changeTab('completed')} className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'completed' ? 'bg-white text-green-700 border-t-2 border-t-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>✅ 완료 내역</button>
      </div>

      {/* 툴바 */}
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
            {isAdding ? '⏳ 추가 중...' : '+ 새 항목 5줄 추가'}
          </button>
        </div>
      </div>

      {/* 테이블 영역 */}
      <div className="overflow-x-auto min-h-[400px] relative">
        {isLoading && (
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
                    
                    {/* ✨ 모든 입력창에 절대 안 터지는 방탄조끼 장착 */}
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="date" value={typeof row.purchaseDate === 'string' ? row.purchaseDate : ''} onChange={(e) => handleLocalChange(row.id, 'purchaseDate', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 text-xs">{row.purchaseDate}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select value={row.accountHolder || ''} onChange={(e) => handleLocalChange(row.id, 'accountHolder', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white">
                          <option value="">선택 안됨</option>
                          {/* 🛡️ 여기서 safeAccounts만 사용하도록 100% 차단! */}
                          {safeAccounts.map((acc, idx) => (
                            <option key={acc?.accountHolder || idx} value={acc?.accountHolder || ''}>{acc?.accountHolder || '이름 없음'}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="py-2 px-1 truncate max-w-[90px] mx-auto text-xs">{row.accountHolder || '-'}</div>
                      )}
                    </td>
                    
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.platform || ''} onChange={(e) => handleLocalChange(row.id, 'platform', e.target.value)} placeholder="플랫폼" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[80px] mx-auto text-xs">{row.platform || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.productName || ''} onChange={(e) => handleLocalChange(row.id, 'productName', e.target.value)} placeholder="상품명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs" /> : <div className="py-2 px-1 truncate max-w-[140px] mx-auto text-xs" title={row.productName}>{row.productName || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.chatRoomName || ''} onChange={(e) => handleLocalChange(row.id, 'chatRoomName', e.target.value)} placeholder="카톡방명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs" /> : <div className="py-2 px-1 truncate max-w-[130px] mx-auto text-xs" title={row.chatRoomName}>{row.chatRoomName || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.paybackName || ''} onChange={(e) => handleLocalChange(row.id, 'paybackName', e.target.value)} placeholder="입금자명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[100px] mx-auto text-xs" title={row.paybackName}>{row.paybackName || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.contactOnBangpok || ''} onChange={(e) => handleLocalChange(row.id, 'contactOnBangpok', e.target.value)} placeholder="연락처" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[120px] mx-auto text-xs" title={row.contactOnBangpok}>{row.contactOnBangpok || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-right">
                      {isEditing ? <input type="number" value={row.price ? Number(row.price) : 0} onChange={(e) => handleLocalChange(row.id, 'price', parseInt(e.target.value) || 0)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-right text-xs" /> : <div className="py-2 px-1 text-xs">{Number(row.price || 0).toLocaleString()}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select value={row.reviewType || '(빈)별점'} onChange={(e) => handleLocalChange(row.id, 'reviewType', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white">
                          <option value="(빈)별점">(빈)별점</option>
                          <option value="(빈)텍스트">(빈)텍스트</option>
                          <option value="(빈)원고제공">(빈)원고제공</option>
                          <option value="실배">실배</option>
                        </select>
                      ) : <div className="py-2 px-1 text-xs text-center">{row.reviewType || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center align-middle">
                      <div className="flex flex-col gap-1.5 px-1">
                        {row.reviewType === '(빈)텍스트' ? (
                          !row.generatedReview ? (
                            <button type="button" onClick={() => handleGenerateAi(row.id, row.productName)} className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full">생성</button>
                          ) : (
                            <button type="button" onClick={() => setModalReview({ id: row.id, text: row.generatedReview || '' })} className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full">📄 보기</button>
                          )
                        ) : (
                          <span className="text-gray-400 text-[11px] block text-center py-1.5">-</span>
                        )}
                      </div>
                    </td>

                    <td className={`p-1 border-r text-center transition-colors duration-300 ${writtenBg}`}>
                      <input type="checkbox" checked={isWritten} onChange={(e) => handleCheckChange(row.id, 'isReviewWritten', e.target.checked)} className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer" />
                    </td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${productBg}`}>
                      <input type="checkbox" checked={isProductPayback} onChange={(e) => handleCheckChange(row.id, 'isProductPayback', e.target.checked)} className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer" />
                    </td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${reviewBg}`}>
                      <input type="checkbox" checked={isReviewPayback} onChange={(e) => handleCheckChange(row.id, 'isReviewPayback', e.target.checked)} className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer" />
                    </td>

                    <td className="px-1 py-3 border-r text-center">
                      <div className="flex gap-1 justify-center">
                        {isEditing ? (
                          <button type="button" onClick={() => handleSave(row)} className="px-2 py-1 bg-green-500 text-white rounded font-medium hover:bg-green-600 text-xs transition-colors">저장</button>
                        ) : (
                          <button type="button" onClick={() => handleEdit(row.id)} className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium hover:bg-blue-100 text-xs transition-colors">수정</button>
                        )}
                        <button type="button" onClick={() => handleDuplicate(row.id)} className="px-2 py-1 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded font-medium hover:bg-yellow-100 text-xs transition-colors">복제</button>
                        <button type="button" onClick={() => handleDelete(row.id)} className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded font-medium hover:bg-red-100 text-xs transition-colors">삭제</button>
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

      {/* 페이징 하단 바 */}
      <div className="flex justify-center items-center py-4 bg-white border-t gap-2">
        <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold">이전</button>
        <span className="text-sm font-bold text-gray-600 px-4">{currentPage} / {totalPages} 페이지</span>
        <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold">다음</button>
      </div>

      {/* AI 리뷰 보기 모달 */}
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
              <button type="button" onClick={() => handleCopy(modalReview.text)} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors">복사하기</button>
              <button type="button" onClick={() => setModalReview(null)} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 전체 AI 생성 중 대기 모달 */}
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