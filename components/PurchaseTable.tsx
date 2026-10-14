'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { addPurchase, updatePurchase, deletePurchase, deletePurchases, duplicatePurchase } from '@/app/actions/purchase';
import { generateAiReview } from '@/app/actions/ai';

type Purchase = {
  id: string;
  purchaseDate: string;
  accountHolder: string;
  productName: string;
  chatRoomName: string;
  platform: string;
  price: number;
  reviewType: string;
  paybackName: string;
  contactOnBangpok: string;
  isReviewWritten: boolean;
  isProductPayback: boolean;
  isReviewPayback: boolean;
  generatedReview: string;
};

export default function PurchaseTable({ initialData, accounts }: { initialData: Purchase[], accounts: { accountHolder: string }[] }) {
  const [localData, setLocalData] = useState<Purchase[]>(initialData);
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [modalReview, setModalReview] = useState<{ id: string, text: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const cancelBulkRef = useRef(false);

  useEffect(() => {
    setLocalData(initialData);
    setSelectedRows(prev => {
      const next = new Set(prev);
      const validIds = new Set(initialData.map(r => r.id));
      next.forEach(id => { if (!validIds.has(id)) next.delete(id); });
      return next;
    });
  }, [initialData]);

  const handleAddRow = () => {
    startTransition(async () => {
      const defaultAccount = accounts.length > 0 ? accounts[0].accountHolder : '';
      const newRows = await addPurchase(defaultAccount);
      if (newRows && newRows.length > 0) {
        setEditingRows(prev => {
          const next = new Set(prev);
          newRows.forEach((row: any) => next.add(row.id));
          return next;
        });
      }
    });
  };

  const handleLocalChange = (id: string, field: keyof Purchase, value: any) => {
    setLocalData(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleEdit = (id: string) => setEditingRows(prev => new Set(prev).add(id));

  const handleSave = (row: Purchase) => {
    startTransition(async () => {
      await updatePurchase(row.id, row);
      setEditingRows(prev => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('삭제하시겠습니까?')) {
      startTransition(() => deletePurchase(id));
    }
  };

  const handleDuplicate = (id: string) => {
    startTransition(async () => {
      const duplicatedRow = await duplicatePurchase(id);
      if (duplicatedRow) {
        setLocalData(prev => {
          const index = prev.findIndex(r => r.id === id);
          if (index === -1) return prev;
          const newData = [...prev];
          newData.splice(index, 0, duplicatedRow as Purchase);
          return newData;
        });
      }
    });
  };

  const handleBulkDelete = () => {
    if (selectedRows.size === 0) return alert('삭제할 항목을 체크박스로 선택해주세요.');
    if (confirm(`선택한 ${selectedRows.size}개 항목을 한 번에 삭제하시겠습니까?`)) {
      startTransition(async () => {
        await deletePurchases(Array.from(selectedRows));
        setSelectedRows(new Set());
      });
    }
  };

  const toggleAllSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedRows(new Set(localData.map(r => r.id)));
    else setSelectedRows(new Set());
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerateAi = async (id: string, productName: string) => {
    if (!productName) return alert('상품명을 먼저 입력(또는 저장)해주세요!');
    startTransition(async () => {
      try {
        const text = await generateAiReview(id, productName);
        handleLocalChange(id, 'generatedReview', text);
      } catch (e: any) { alert(e.message || 'AI 리뷰 생성 오류'); }
    });
  };

// ✨ 전체 AI 리뷰 생성 최적화 로직 (중복 상품명 DB 일괄 저장 완벽 적용)
  const handleBulkGenerateAi = async () => {
    const targets = localData.filter(r => 
      r.reviewType === '(빈)텍스트' && 
      !r.generatedReview && 
      r.productName.trim() !== ''
    );
    
    if (targets.length === 0) return alert('생성할 대상이 없습니다.\n(조건: (빈)텍스트 + 생성된 리뷰 없음 + 상품명 입력됨)');
    
    // 중복된 상품명 제거 (API 호출 횟수 단축)
    const uniqueProductNames = Array.from(new Set(targets.map(t => t.productName.trim())));

    if (!confirm(`총 ${targets.length}개의 빈 항목이 발견되었습니다.\n중복을 제외한 [${uniqueProductNames.length}개]의 상품명에 대해 AI 생성을 시작합니다.`)) return;

    setIsBulkGenerating(true);
    cancelBulkRef.current = false;
    
    for (let i = 0; i < uniqueProductNames.length; i++) {
      if (cancelBulkRef.current) { alert('생성 작업이 취소되었습니다.'); break; }
      
      const currentProductName = uniqueProductNames[i];
      setBulkProgress({ current: i + 1, total: uniqueProductNames.length });
      
      try {
        // 1. 현재 상품명과 일치하는 모든 행 찾기
        const matchingRows = targets.filter(t => t.productName.trim() === currentProductName);
        const sampleId = matchingRows[0].id; // 첫 번째 대표 행의 ID

        // 2. 대표로 한 번만 AI API 호출 (구글 할당량 절약)
        const generatedText = await generateAiReview(sampleId, currentProductName);
        
        // 3. ✨ 핵심 수정: 동일한 상품명을 가진 2번째, 3번째 행들도 DB에 확실하게 저장 (복사)
        const otherRows = matchingRows.slice(1);
        for (const row of otherRows) {
          await updatePurchase(row.id, { ...row, generatedReview: generatedText });
        }

        // 4. 화면(UI) 즉시 업데이트: 방금 생성(복사)한 텍스트를 화면에 바로 씌우고 '보기' 버튼으로 전환
        setLocalData(prev => prev.map(r => 
          (r.reviewType === '(빈)텍스트' && !r.generatedReview && r.productName.trim() === currentProductName)
            ? { ...r, generatedReview: generatedText }
            : r
        ));
      } catch (e) { 
        console.error(`생성 실패 (${currentProductName}):`, e); 
      }
      
      // 다음 API 호출 전 서버 보호 딜레이
      if (i < uniqueProductNames.length - 1 && !cancelBulkRef.current) await new Promise(res => setTimeout(res, 1500));
    }
    
    setIsBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0 });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('리뷰가 클립보드에 복사되었습니다!');
  };

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          구매 내역 관리
          {selectedRows.size > 0 && <span className="text-sm font-bold text-red-500">({selectedRows.size}개 선택됨)</span>}
        </h2>
        <div className="flex gap-2">
          <button onClick={handleBulkGenerateAi} disabled={isPending || isBulkGenerating} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">✨ 전체 AI 생성</button>
          <button onClick={handleBulkDelete} disabled={isPending || isBulkGenerating || selectedRows.size === 0} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50">🗑️ 선택 삭제</button>
          <button onClick={handleAddRow} disabled={isPending || isBulkGenerating} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">+ 새 항목 5줄 추가</button>
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
              <th className="px-2 py-3 border-r w-[120px] text-center">방폭 연락처</th>
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
                      {isEditing ? <input type="text" value={row.contactOnBangpok} onChange={(e) => handleLocalChange(row.id, 'contactOnBangpok', e.target.value)} placeholder="연락처" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs" /> : <div className="py-2 px-1 truncate max-w-[120px] mx-auto text-xs" title={row.contactOnBangpok}>{row.contactOnBangpok || '-'}</div>}
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
                            <button onClick={() => setModalReview({ id: row.id, text: row.generatedReview })} className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full">📄 보기</button>
                          )
                        ) : (
                          <span className="text-gray-400 text-[11px] block text-center py-1.5">-</span>
                        )}
                      </div>
                    </td>

                    <td className={`p-1 border-r text-center transition-colors duration-300 ${writtenBg}`}>
                      <input type="checkbox" checked={isWritten} onChange={(e) => handleLocalChange(row.id, 'isReviewWritten', e.target.checked)} onClick={(e) => { if (!isEditing) e.preventDefault(); }} className={`w-5 h-5 rounded mt-1 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`} />
                    </td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${productBg}`}>
                      <input type="checkbox" checked={isProductPayback} onChange={(e) => handleLocalChange(row.id, 'isProductPayback', e.target.checked)} onClick={(e) => { if (!isEditing) e.preventDefault(); }} className={`w-5 h-5 rounded mt-1 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`} />
                    </td>
                    <td className={`p-1 border-r text-center transition-colors duration-300 ${reviewBg}`}>
                      <input type="checkbox" checked={isReviewPayback} onChange={(e) => handleLocalChange(row.id, 'isReviewPayback', e.target.checked)} onClick={(e) => { if (!isEditing) e.preventDefault(); }} className={`w-5 h-5 rounded mt-1 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`} />
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