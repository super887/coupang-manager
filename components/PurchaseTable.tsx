'use client';

import { useState, useTransition, useRef } from 'react';
import { addPurchase, updatePurchase, deletePurchase, deletePurchases, duplicatePurchase } from '@/app/actions/purchase';
import { generateAiReview } from '@/app/actions/ai';

type Purchase = {
  id: string;
  productName: string;
  reviewType: string;
  generatedReview: string | null;
  memo: string | null;
  createdAt: Date;
  [key: string]: any; 
};

export default function PurchaseTable({ initialData, accounts }: { initialData: Purchase[], accounts: any[] }) {
  // --- 상태 관리 ---
  const [localData, setLocalData] = useState<Purchase[]>(initialData);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [modalReview, setModalReview] = useState<{id: string, text: string} | null>(null);
  const [isPending, startTransition] = useTransition();
  
  // AI 생성 및 추가 관련 로딩 상태
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const cancelBulkRef = useRef(false);
  const [isAdding, setIsAdding] = useState(false); // ✨ 새 항목 5줄 추가 중 잠금 상태

  // --- 체크박스 및 선택 로직 ---
  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedRows.size === localData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(localData.map(r => r.id)));
    }
  };

  // --- 텍스트 복사 ---
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    alert('복사되었습니다!');
  };

  // --- 단일 AI 생성 ---
  const handleGenerateAi = async (id: string, productName: string) => {
    try {
      const generatedText = await generateAiReview(id, productName);
      setLocalData(prev => prev.map(r => r.id === id ? { ...r, generatedReview: generatedText } : r));
      await updatePurchase(id, { generatedReview: generatedText });
    } catch (e) {
      alert('AI 리뷰 생성에 실패했습니다.');
    }
  };

  // --- 편집(수정) 모드 로직 ---
  const handleEdit = (id: string) => {
    setEditingRows(prev => { const next = new Set(prev); next.add(id); return next; });
  };

  const handleLocalChange = (id: string, field: string, value: any) => {
    setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // 🚀 낙관적 업데이트 1: 저장 (0.1초 컷)
  const handleSave = async (row: Purchase) => {
    const previousData = [...localData];
    setEditingRows(prev => { const next = new Set(prev); next.delete(row.id); return next; });

    try {
      await updatePurchase(row.id, row);
    } catch (error) {
      console.error('수정 실패:', error);
      setLocalData(previousData);
      setEditingRows(prev => { const next = new Set(prev); next.add(row.id); return next; });
      alert('수정에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  // 🚀 낙관적 업데이트 2: 단일 삭제 (0.1초 컷)
  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    const previousData = [...localData];
    setLocalData(prev => prev.filter(item => item.id !== id));
    setSelectedRows(prev => { const next = new Set(prev); next.delete(id); return next; });

    try {
      await deletePurchase(id);
    } catch (error) {
      console.error('삭제 실패:', error);
      setLocalData(previousData);
      alert('삭제에 실패했습니다.');
    }
  };

  // 🚀 낙관적 업데이트 3: 다중 삭제 (0.1초 컷)
  const handleBulkDelete = async () => {
    if (selectedRows.size === 0 || !confirm(`선택한 ${selectedRows.size}개의 항목을 삭제하시겠습니까?`)) return;
    
    const previousData = [...localData];
    const idsToDelete = Array.from(selectedRows);
    
    setLocalData(prev => prev.filter(item => !idsToDelete.includes(item.id)));
    setSelectedRows(new Set());

    try {
      await deletePurchases(idsToDelete);
    } catch (error) {
      console.error('다중 삭제 실패:', error);
      setLocalData(previousData);
      alert('삭제에 실패했습니다.');
    }
  };

  // 🚀 낙관적 업데이트 4: 행 복제 (0.1초 컷)
  const handleDuplicate = async (id: string) => {
    const rowToDuplicate = localData.find(r => r.id === id);
    if (!rowToDuplicate) return;

    const previousData = [...localData];
    const tempId = `temp-${Date.now()}`;
    const optimisticRow = { 
      ...rowToDuplicate, 
      id: tempId, 
      createdAt: new Date(Date.now() + 1000) 
    };

    setLocalData(prev => {
      const index = prev.findIndex(item => item.id === id);
      const newData = [...prev];
      newData.splice(index, 0, optimisticRow as Purchase);
      return newData;
    });

    try {
      const newSavedRow = await duplicatePurchase(id);
      setLocalData(prev => prev.map(item => item.id === tempId ? newSavedRow : item));
    } catch (error) {
      console.error('복제 실패:', error);
      setLocalData(previousData);
      alert('복제에 실패했습니다.');
    }
  };

  // 🛡️ 안전한 통신: 항목 5줄 추가 (진짜 ID 딜레마 및 중복 생성 방지)
  const handleAddRow = async () => {
    setIsAdding(true); // 광클 방지 잠금
    
    try {
      // Promise.all 대신 for문으로 순차적으로 1개씩 안전하게 5번 서버에 요청
      const newSavedRows = [];
      for (let i = 0; i < 5; i++) {
        const savedRow = await addPurchase();
        newSavedRows.push(savedRow);
      }
      // 진짜 ID가 박힌 5줄이 완벽히 서버에 생성되면 화면 맨 위에 뿌림
      setLocalData(prev => [...newSavedRows, ...prev]);
    } catch (error) {
      console.error('추가 실패:', error);
      alert('항목 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false); // 완료 후 잠금 해제
    }
  };

  // 🛡️ 안전한 통신: 전체 AI 리뷰 생성 (Flash Lite 15개 제한 로직)
  const handleBulkGenerateAi = async () => {
    const targets = localData.filter(r => 
      r.reviewType === '(빈)텍스트' && 
      !r.generatedReview && 
      (r.productName || '').trim() !== ''
    );
    
    if (targets.length === 0) return alert('생성할 대상이 없습니다.\n(조건: (빈)텍스트 + 생성된 리뷰 없음 + 상품명 입력됨)');
    
    let uniqueProductNames = Array.from(new Set(targets.map(t => t.productName.trim())));

    if (uniqueProductNames.length > 15) {
      alert(`구글 AI의 분당 최대 생성 한도(15개)를 초과하여, 먼저 15개의 상품에 대해서만 리뷰를 생성합니다.\n\n완료 후 다시 버튼을 눌러주세요!`);
      uniqueProductNames = uniqueProductNames.slice(0, 15);
    }

    if (!confirm(`총 [${uniqueProductNames.length}개]의 고유 상품명에 대해 AI 생성을 시작합니다.\n(안전한 생성을 위해 약 ${uniqueProductNames.length * 5}초가 소요됩니다)`)) return;

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

        setLocalData(prev => prev.map(r => 
          (r.reviewType === '(빈)텍스트' && !r.generatedReview && r.productName.trim() === currentProductName)
            ? { ...r, generatedReview: generatedText }
            : r
        ));
      } catch (e) { 
        console.error(`생성 실패 (${currentProductName}):`, e); 
        alert(`앗! '${currentProductName}' 생성 중 에러가 발생했습니다.`);
        break; 
      }
      
      if (i < uniqueProductNames.length - 1 && !cancelBulkRef.current) {
        await new Promise(res => setTimeout(res, 5000));
      }
    }
    
    setIsBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0 });
    alert('✅ 요청하신 AI 리뷰 생성이 완료되었습니다!\n\n아직 남은 항목이 있다면 버튼을 한 번 더 눌러주세요.');
  };

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          구매 내역 관리
          {selectedRows.size > 0 && <span className="text-sm font-bold text-red-500">({selectedRows.size}개 선택됨)</span>}
        </h2>
        <div className="flex gap-2">
          <button onClick={handleBulkGenerateAi} disabled={isPending || isBulkGenerating || isAdding} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50">✨ 전체 AI 생성</button>
          <button onClick={handleBulkDelete} disabled={isPending || isBulkGenerating || isAdding || selectedRows.size === 0} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50">🗑️ 선택 삭제</button>
          
          {/* ✨ 변경된 버튼: isAdding 상태에 따라 UI가 잠기고 메시지가 바뀝니다. */}
          <button 
            onClick={handleAddRow} 
            disabled={isPending || isBulkGenerating || isAdding} 
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-[130px]"
          >
            {isAdding ? '⏳ 추가 중...' : '+ 새 항목 5줄 추가'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs">
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
            {localData.length === 0 ? (
              <tr><td colSpan={15} className="px-4 py-8 text-center text-gray-400">데이터가 없습니다.</td></tr>
            ) : (
              localData.map((row) => {
                const isEditing = editingRows.has(row.id);
                const isSelected = selectedRows.has(row.id);

                const isWritten = row.isReviewWritten;
                const isProductPayback = row.isProductPayback;
                const isReviewPayback = row.isReviewPayback;

                const writtenBg = isWritten ? 'bg-blue-100' : '';
                const productBg = isProductPayback ? 'bg-blue-100' : (isWritten ? 'bg-red-100' : '');
                const reviewBg = isReviewPayback ? 'bg-blue-100' : (isWritten ? 'bg-red-100' : '');
                const rowBg = isSelected ? 'bg-red-50/40' : (isEditing ? 'bg-yellow-50/30' : 'hover:bg-blue-50/20');

                return (
                  <tr key={row.id} className={`${rowBg} transition-colors`}>
                    
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="date" value={row.purchaseDate} onChange={(e) => handleLocalChange(row.id, 'purchaseDate', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 text-xs">{row.purchaseDate}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select 
                          value={row.accountHolder || ''} 
                          onChange={(e) => handleLocalChange(row.id, 'accountHolder', e.target.value)} 
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white"
                        >
                          <option value="">선택 안됨</option>
                          {accounts.map(acc => (
                            <option key={acc.accountHolder} value={acc.accountHolder}>{acc.accountHolder}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="py-2 px-1 truncate max-w-[90px] mx-auto text-xs">{row.accountHolder || '-'}</div>
                      )}
                    </td>
                    
                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.platform || ''} onChange={(e) => handleLocalChange(row.id, 'platform', e.target.value)} placeholder="플랫폼" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[80px] mx-auto text-xs">{row.platform}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.productName} onChange={(e) => handleLocalChange(row.id, 'productName', e.target.value)} placeholder="상품명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs" /> : <div className="py-2 px-1 truncate max-w-[140px] mx-auto text-xs" title={row.productName}>{row.productName || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.chatRoomName} onChange={(e) => handleLocalChange(row.id, 'chatRoomName', e.target.value)} placeholder="카톡방명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs" /> : <div className="py-2 px-1 truncate max-w-[130px] mx-auto text-xs" title={row.chatRoomName}>{row.chatRoomName || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.paybackName} onChange={(e) => handleLocalChange(row.id, 'paybackName', e.target.value)} placeholder="입금자명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[100px] mx-auto text-xs" title={row.paybackName}>{row.paybackName || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? <input type="text" value={row.contactOnBangpok || ''} onChange={(e) => handleLocalChange(row.id, 'contactOnBangpok', e.target.value)} placeholder="연락처" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[120px] mx-auto text-xs" title={row.contactOnBangpok}>{row.contactOnBangpok || '-'}</div>}
                    </td>

                    <td className="p-1 border-r text-right">
                      {isEditing ? <input type="number" value={row.price} onChange={(e) => handleLocalChange(row.id, 'price', parseInt(e.target.value) || 0)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-right text-xs" /> : <div className="py-2 px-1 text-xs">{row.price.toLocaleString()}</div>}
                    </td>

                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select value={row.reviewType} onChange={(e) => handleLocalChange(row.id, 'reviewType', e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white">
                          <option value="(빈)별점">(빈)별점</option>
                          <option value="(빈)텍스트">(빈)텍스트</option>
                          <option value="(빈)원고제공">(빈)원고제공</option>
                          <option value="실배">실배</option>
                        </select>
                      ) : <div className="py-2 px-1 text-xs text-center">{row.reviewType}</div>}
                    </td>

                    <td className="p-1 border-r text-center align-middle">
                      <div className="flex flex-col gap-1.5 px-1">
                        {row.reviewType === '(빈)텍스트' ? (
                          !row.generatedReview ? (
                            <button onClick={() => handleGenerateAi(row.id, row.productName)} className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full">생성</button>
                          ) : (
                            <button onClick={() => setModalReview({ id: row.id, text: row.generatedReview || '' })} className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full">📄 보기</button>
                          )
                        ) : (
                          <span className="text-gray-400 text-[11px] block text-center py-1.5">-</span>
                        )}
                      </div>
                    </td>

                    <td className={`p-1 border-r text-center transition-colors duration-300 ${writtenBg}`}>
                      <input type="checkbox" checked={isWritten || false} onChange={(e) => handleLocalChange(row.id, 'isReviewWritten', e.target.checked)} onClick={(e) => { if (!isEditing) e.preventDefault(); }} className={`w-5 h-5 rounded mt-1 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`} />
                    </td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${productBg}`}>
                      <input type="checkbox" checked={isProductPayback || false} onChange={(e) => handleLocalChange(row.id, 'isProductPayback', e.target.checked)} onClick={(e) => { if (!isEditing) e.preventDefault(); }} className={`w-5 h-5 rounded mt-1 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`} />
                    </td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${reviewBg}`}>
                      <input type="checkbox" checked={isReviewPayback || false} onChange={(e) => handleLocalChange(row.id, 'isReviewPayback', e.target.checked)} onClick={(e) => { if (!isEditing) e.preventDefault(); }} className={`w-5 h-5 rounded mt-1 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`} />
                    </td>

                    <td className="px-1 py-3 border-r text-center">
                      <div className="flex gap-1 justify-center">
                        {isEditing ? (
                          <button onClick={() => handleSave(row)} className="px-2 py-1 bg-green-500 text-white rounded font-medium hover:bg-green-600 text-xs transition-colors">저장</button>
                        ) : (
                          <button onClick={() => handleEdit(row.id)} className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium hover:bg-blue-100 text-xs transition-colors">수정</button>
                        )}
                        <button onClick={() => handleDuplicate(row.id)} className="px-2 py-1 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded font-medium hover:bg-yellow-100 text-xs transition-colors">복제</button>
                        <button onClick={() => handleDelete(row.id)} className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded font-medium hover:bg-red-100 text-xs transition-colors">삭제</button>
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
      
      {modalReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">📄 AI 리뷰 확인</h3>
              <button onClick={() => setModalReview(null)} className="text-gray-400 hover:text-gray-600 font-bold text-xl">✕</button>
            </div>
            <textarea
              value={modalReview.text}
              onChange={(e) => {
                setModalReview({ ...modalReview, text: e.target.value });
                handleLocalChange(modalReview.id, 'generatedReview', e.target.value);
              }}
              readOnly={!editingRows.has(modalReview.id)}
              className={`w-full h-48 p-4 border rounded-lg text-sm resize-none outline-none ${editingRows.has(modalReview.id) ? 'border-blue-400 focus:ring-2 focus:ring-blue-500 bg-white' : 'border-gray-200 bg-gray-50'}`}
              placeholder="리뷰 텍스트가 없습니다."
            />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => handleCopy(modalReview.text)} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors">복사하기</button>
              <button onClick={() => setModalReview(null)} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">닫기</button>
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
            <button onClick={() => { cancelBulkRef.current = true; }} className="px-6 py-2 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-lg transition-colors w-full">생성 취소</button>
          </div>
        </div>
      )}
    </div>
  );
}