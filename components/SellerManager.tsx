'use client';

import { useState, useEffect } from 'react';
import { addSeller, updateSeller, deleteSeller } from '@/app/actions/info';

type SellerInfo = {
  id: string;
  companyName: string;
  submissionForm: string;
};

export default function SellerManager({ initialData = [] }: { initialData: SellerInfo[] }) {
  // 🛡️ 빈 값이나 잘못된 값이 들어와도 터지지 않게 방어막 설정
  const safeData = Array.isArray(initialData) ? initialData : [];
  const [localData, setLocalData] = useState<SellerInfo[]>(safeData);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    setLocalData(Array.isArray(initialData) ? initialData : []);
  }, [initialData]);

  // ✨ 새 업체 추가 시 즉시 '수정 모드'로 열리도록 업그레이드!
  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      const newSeller = await addSeller();
      if (newSeller) {
         setLocalData(prev => [newSeller as unknown as SellerInfo, ...prev]);
         setEditingIds(prev => new Set(prev).add((newSeller as any).id)); // 곧바로 수정 모드 짠!
      }
    } catch (error) {
      console.error('추가 실패:', error);
      alert('업체 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleLocalChange = (id: string, field: keyof SellerInfo, value: string) => {
    setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setEditingIds(prev => new Set(prev).add(id));
  };

  const handleSave = async (e: React.MouseEvent, item: SellerInfo) => {
    e.preventDefault();
    setEditingIds(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    try {
      await updateSeller(item.id, item);
    } catch (error) {
      setEditingIds(prev => new Set(prev).add(item.id));
      alert('수정에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm('이 판매자 정보를 삭제하시겠습니까?')) return;
    const previousData = [...localData];
    setLocalData(prev => prev.filter(item => item.id !== id));
    try {
      await deleteSeller(id);
    } catch (error) {
      setLocalData(previousData);
      alert('삭제에 실패했습니다.');
    }
  };

  // ✨ 클릭 한방에 클립보드로 싹 복사해주는 효자 기능!
  const handleCopy = async (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    if (!text) return alert('복사할 내용이 없습니다.');
    try {
      await navigator.clipboard.writeText(text);
      alert('양식이 복사되었습니다!');
    } catch (err) {
      alert('복사에 실패했습니다.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">🏢 판매자 정보 관리</h2>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isAdding}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {isAdding ? '⏳ 추가 중...' : '+ 업체 추가'}
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto bg-gray-50/50 space-y-4">
        {localData.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">등록된 판매자(업체)가 없습니다.</div>
        ) : (
          localData.map((item) => {
            const isEditing = editingIds.has(item.id);
            return (
              <div key={item.id} className={`p-4 rounded-xl border transition-all ${isEditing ? 'bg-yellow-50/30 border-purple-300 shadow-md' : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'}`}>
                
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 w-full max-w-[60%]">
                    <span className="text-gray-500 font-medium text-sm shrink-0">업체명 :</span>
                    {isEditing ? (
                      <input type="text" value={item.companyName || ''} onChange={(e) => handleLocalChange(item.id, 'companyName', e.target.value)} placeholder="업체명 입력" className="flex-1 p-1.5 border rounded outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold bg-white" />
                    ) : (
                      <span className="font-bold text-lg text-gray-800 truncate">{item.companyName || '업체명 없음'}</span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {isEditing ? (
                      <button type="button" onClick={(e) => handleSave(e, item)} className="px-3 py-1.5 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600 transition-colors">저장</button>
                    ) : (
                      <button type="button" onClick={(e) => handleEdit(e, item.id)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200 transition-colors">수정</button>
                    )}
                    <button type="button" onClick={(e) => handleDelete(e, item.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded text-sm font-medium hover:bg-red-100 transition-colors">삭제</button>
                  </div>
                </div>

                <div className="mt-2">
                  <div className="flex justify-between items-end mb-1">
                    <span className="block text-gray-500 font-medium text-sm">제출 양식 (텍스트 입력) :</span>
                    
                    {/* ✨ 보기 모드일 때만 예쁘게 등장하는 '내용 복사' 버튼 */}
                    {!isEditing && item.submissionForm && (
                      <button 
                        type="button" 
                        onClick={(e) => handleCopy(e, item.submissionForm)}
                        className="px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded text-xs font-bold hover:bg-purple-100 transition-colors flex items-center gap-1 shadow-sm"
                      >
                        📋 복사하기
                      </button>
                    )}
                  </div>
                  
                  {isEditing ? (
                    <textarea 
                      value={item.submissionForm || ''} 
                      onChange={(e) => handleLocalChange(item.id, 'submissionForm', e.target.value)} 
                      rows={5}
                      placeholder="여기에 제출 양식을 자유롭게 입력하세요."
                      className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-y bg-white"
                    />
                  ) : (
                    <div className="w-full p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm text-gray-700 whitespace-pre-wrap min-h-[100px]">
                      {item.submissionForm || <span className="text-gray-400 italic">입력된 양식이 없습니다.</span>}
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}