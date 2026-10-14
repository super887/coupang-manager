'use client';

import { useState, useEffect, useRef } from 'react';
import { addPurchase, updatePurchase, deletePurchase, deletePurchases, duplicatePurchase, getPaginatedPurchases } from '@/app/actions/purchase';
import { generateAiReview } from '@/app/actions/ai';

export default function PurchaseTable({ accounts }: { accounts: any[] }) {
  // --- 페이징, 검색, 탭 상태 관리 ---
  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [searchField, setSearchField] = useState('productName');
  const [searchInput, setSearchInput] = useState(''); // 타이핑용
  const [appliedSearch, setAppliedSearch] = useState(''); // 실제 검색 트리거용
  
  const [localData, setLocalData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- 기존 상태 관리 ---
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [modalReview, setModalReview] = useState<{id: string, text: string} | null>(null);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const cancelBulkRef = useRef(false);
  const [isAdding, setIsAdding] = useState(false);

  // 🚀 핵심: 조건이 바뀔 때마다 서버에서 데이터를 다시 가져옴 (100개씩)
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await getPaginatedPurchases({
        page: currentPage,
        pageSize: 100, // 100개 고정!
        searchField: searchField,
        searchKeyword: appliedSearch,
        isCompleted: activeTab === 'completed'
      });
      setLocalData(data.items);
      setTotalPages(data.totalPages || 1);
      setSelectedRows(new Set()); // 페이지 이동 시 선택 초기화
    } catch (error) {
      console.error('데이터 불러오기 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, appliedSearch, activeTab]);

  // --- 검색 및 탭 이동 핸들러 ---
  const executeSearch = () => {
    setCurrentPage(1); // 검색 시 1페이지로 리셋
    setAppliedSearch(searchInput);
  };

  const changeTab = (tab: 'progress' | 'completed') => {
    if (activeTab === tab) return;
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchInput('');
    setAppliedSearch('');
  };

  // --- 체크박스 3종 세트 (낙관적 탭 이동 로직) ---
  const handleCheckChange = async (id: string, field: string, value: boolean) => {
    const row = localData.find(r => r.id === id);
    if (!row) return;

    const updatedRow = { ...row, [field]: value };
    // 3개가 모두 체크되었는지 검사
    const isNowCompleted = updatedRow.isReviewWritten && updatedRow.isProductPayback && updatedRow.isReviewPayback;
    
    // 현재 탭의 상태와 맞지 않게 되면 화면에서 즉시(낙관적) 날려버림
    const shouldVanish = (activeTab === 'progress' && isNowCompleted) || (activeTab === 'completed' && !isNowCompleted);

    if (shouldVanish) {
      setLocalData(prev => prev.filter(r => r.id !== id));
    } else {
      setLocalData(prev => prev.map(r => r.id === id ? updatedRow : r));
    }

    try {
      await updatePurchase(id, { [field]: value });
    } catch (e) {
      alert('상태 업데이트에 실패했습니다.');
      fetchData(); // 실패 시 서버에서 롤백 데이터 땡겨옴
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    alert('복사되었습니다!');
  };

  const toggleAllSelection = () => {
    if (selectedRows.size === localData.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(localData.map(r => r.id)));
  };

  // 🚀 저장 로직
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
      // 추가 후 무조건 1페이지, 진행중 탭으로 이동해서 최신 데이터를 리로드
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
        <button onClick={() => changeTab('progress')} className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'progress' ? 'bg-white text-purple-700 border-t-2 border-t-purple-600' : 'text-gray-500 hover:bg-gray-50'}`}>🔥 진행 중 내역</button>
        <button onClick={() => changeTab('completed')} className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'completed' ? 'bg-white text-green-700 border-t-2 border-t-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>✅ 완료 내역</button>
      </div>

      {/* 툴바 (검색 및 버튼) */}
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
          <button onClick={executeSearch} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-700">검색</button>
        </div>

        <div className="flex gap-2">
          <button onClick={handleBulkDelete} disabled={selectedRows.size === 0} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">🗑️ 선택 삭제</button>
          <button onClick={handleAddRow} disabled={isAdding} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 w-[130px]">
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
                <input type="checkbox" onChange={toggleAllSelection} checked={localData.length > 0 && selectedRows.size === localData.length} className="w-4 h-4 cursor-pointer" />
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
                return (
                  <tr key={row.id} className={`${isSelected ? 'bg-red-50/40' : (isEditing ? 'bg-yellow-50/30' : 'hover:bg-blue-50/10')} transition-colors`}>
                    <td className="p-1 border-r text-center">{isEditing ? <input type="date" value={row.purchaseDate} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, purchaseDate: e.target.value}:r))} className="w-full p-2 border rounded text-xs" /> : <div className="py-2 px-1 text-xs">{row.purchaseDate}</div>}</td>
                    <td className="p-1 border-r text-center">{isEditing ? (
                        <select value={row.accountHolder || ''} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, accountHolder: e.target.value}:r))} className="w-full p-2 border rounded text-xs">
                          <option value="">선택 안됨</option>
                          {accounts.map(acc => <option key={acc.accountHolder} value={acc.accountHolder}>{acc.accountHolder}</option>)}
                        </select>
                      ) : <div className="py-2 px-1 truncate max-w-[90px] mx-auto text-xs">{row.accountHolder || '-'}</div>}
                    </td>
                    <td className="p-1 border-r text-center">{isEditing ? <input type="text" value={row.platform || ''} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, platform: e.target.value}:r))} className="w-full p-2 border rounded text-xs" /> : <div className="py-2 px-1 truncate max-w-[80px] mx-auto text-xs">{row.platform}</div>}</td>
                    <td className="p-1 border-r text-center">{isEditing ? <input type="text" value={row.productName} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, productName: e.target.value}:r))} className="w-full p-2 border rounded text-xs" /> : <div className="py-2 px-1 truncate max-w-[140px] mx-auto text-xs">{row.productName || '-'}</div>}</td>
                    <td className="p-1 border-r text-center">{isEditing ? <input type="text" value={row.chatRoomName} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, chatRoomName: e.target.value}:r))} className="w-full p-2 border rounded text-xs" /> : <div className="py-2 px-1 truncate max-w-[130px] mx-auto text-xs">{row.chatRoomName || '-'}</div>}</td>
                    <td className="p-1 border-r text-center">{isEditing ? <input type="text" value={row.paybackName} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, paybackName: e.target.value}:r))} className="w-full p-2 border rounded text-xs" /> : <div className="py-2 px-1 truncate max-w-[100px] mx-auto text-xs">{row.paybackName || '-'}</div>}</td>
                    <td className="p-1 border-r text-center">{isEditing ? <input type="text" value={row.contactOnBangpok || ''} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, contactOnBangpok: e.target.value}:r))} className="w-full p-2 border rounded text-xs" /> : <div className="py-2 px-1 truncate max-w-[120px] mx-auto text-xs">{row.contactOnBangpok || '-'}</div>}</td>
                    <td className="p-1 border-r text-right">{isEditing ? <input type="number" value={row.price} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, price: parseInt(e.target.value)||0}:r))} className="w-full p-2 border rounded text-right text-xs" /> : <div className="py-2 px-1 text-xs">{row.price.toLocaleString()}</div>}</td>
                    <td className="p-1 border-r text-center">{isEditing ? (
                        <select value={row.reviewType} onChange={(e) => setLocalData(p=>p.map(r=>r.id===row.id?{...r, reviewType: e.target.value}:r))} className="w-full p-2 border rounded text-xs">
                          <option value="(빈)별점">(빈)별점</option><option value="(빈)텍스트">(빈)텍스트</option><option value="(빈)원고제공">(빈)원고제공</option><option value="실배">실배</option>
                        </select>
                      ) : <div className="py-2 px-1 text-xs text-center">{row.reviewType}</div>}
                    </td>
                    <td className="p-1 border-r text-center align-middle">
                        {row.reviewType === '(빈)텍스트' && row.generatedReview && (
                          <button onClick={() => setModalReview({ id: row.id, text: row.generatedReview })} className="bg-blue-100 text-blue-700 text-[11px] py-1.5 px-2 rounded font-medium w-full hover:bg-blue-200">📄 보기</button>
                        )}
                    </td>
                    
                    {/* ✨ 낙관적 탭 이동을 담당하는 체크박스 3인방 */}
                    <td className="p-1 border-r text-center"><input type="checkbox" checked={row.isReviewWritten || false} onChange={e => handleCheckChange(row.id, 'isReviewWritten', e.target.checked)} className="w-5 h-5 mt-1 cursor-pointer" /></td>
                    <td className="p-1 border-r text-center"><input type="checkbox" checked={row.isProductPayback || false} onChange={e => handleCheckChange(row.id, 'isProductPayback', e.target.checked)} className="w-5 h-5 mt-1 cursor-pointer" /></td>
                    <td className="p-1 border-r text-center"><input type="checkbox" checked={row.isReviewPayback || false} onChange={e => handleCheckChange(row.id, 'isReviewPayback', e.target.checked)} className="w-5 h-5 mt-1 cursor-pointer" /></td>

                    <td className="px-1 py-3 border-r text-center">
                      <div className="flex gap-1 justify-center">
                        {isEditing ? <button onClick={() => handleSave(row)} className="px-2 py-1 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600">저장</button>
                                  : <button onClick={() => setEditingRows(p => new Set(p).add(row.id))} className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded text-xs font-medium hover:bg-blue-100">수정</button>}
                        <button onClick={() => handleDuplicate(row.id)} className="px-2 py-1 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded text-xs font-medium hover:bg-yellow-100">복제</button>
                        <button onClick={() => handleDelete(row.id)} className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs font-medium hover:bg-red-100">삭제</button>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center align-middle bg-gray-50 border-l"><input type="checkbox" checked={isSelected} onChange={() => { const n = new Set(selectedRows); n.has(row.id) ? n.delete(row.id) : n.add(row.id); setSelectedRows(n); }} className="w-5 h-5 cursor-pointer accent-red-500" /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이징 하단 바 */}
      <div className="flex justify-center items-center py-4 bg-white border-t gap-2">
        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold">이전</button>
        <span className="text-sm font-bold text-gray-600 px-4">{currentPage} / {totalPages} 페이지</span>
        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold">다음</button>
      </div>

    </div>
  );
}