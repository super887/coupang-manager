'use client';

import { useState, useEffect } from 'react';
import { addSeller, updateSeller, deleteSeller } from '@/app/actions/info';

type SellerInfo = {
  id: string;
  companyName: string;
  submissionForm: string;
};

export default function SellerManager({ initialData }: { initialData: SellerInfo[] }) {
  const [localData, setLocalData] = useState<SellerInfo[]>(initialData);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false); // ✨ 새 업체 추가 잠금 상태

  useEffect(() => {
    setLocalData(initialData);
  }, [initialData]);

  // 🛡️ 안전한 통신: 업체 추가 (가짜 ID 방지 및 광클 차단)
  const handleAdd = async () => {
    setIsAdding(true);
    try {
      const newSeller = await addSeller();
      // 서버에서 진짜 ID가 발급된 새 업체를 받아와서 즉시 화면 맨 위에 추가!
      setLocalData(prev => [newSeller as unknown as SellerInfo, ...prev]);
    } catch (error) {
      console.error('추가 실패:', error);
      alert('업체 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleLocalChange = (id: string, field: keyof SellerInfo, value: string) => {
    // 키보드 입력 시 화면은 즉시 변경 (타이핑 딜레이 없음)
    setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleEdit = (id: string) => setEditingIds(prev => new Set(prev).add(id));

  // 🚀 낙관적 업데이트 1: 저장 (0.1초 컷)
  const handleSave = async (item: SellerInfo) => {
    // 이미 화면은 입력한 대로 바뀌어 있으니, 수정 모드만 즉시 꺼줍니다.
    setEditingIds(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });

    try {
      // 뒤에서 조용히 서버로 데이터 업데이트
      await updateSeller(item.id, item);
    } catch (error) {
      console.error('수정 실패:', error);
      // 실패하면 다시 수정 모드로 롤백
      setEditingIds(prev => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      alert('수정에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 🚀 낙관적 업데이트 2: 단일 삭제 (0.1초 컷)
  const handleDelete = async (id: string) => {
    if (!confirm('이 판매자 정보를 삭제하시겠습니까?')) return;

    const previousData = [...localData];
    // 화면에서 즉시 삭제 (로딩 X)
    setLocalData(prev => prev.filter(item => item.id !== id));

    try {
      // 몰래 서버 삭제 진행
      await deleteSeller(id);
    } catch (error) {
      console.error('삭제 실패:', error);
      setLocalData(previousData); // 실패 시 화면 복구
      alert('삭제에 실패했습니다.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">🏢 판매자 정보 관리</h2>
        <button
          onClick={handleAdd}
          disabled={isAdding}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-[120px]"
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
                      <input type="text" value={item.companyName || ''} onChange={(e) => handleLocalChange(item.id, 'companyName', e.target.value)} placeholder="업체명 입력" className="flex-1 p-1.5 border rounded outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold" />
                    ) : (
                      <span className="font-bold text-lg text-gray-800 truncate">{item.companyName || '업체명 없음'}</span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {isEditing ? (
                      <button onClick={() => handleSave(item)} className="px-3 py-1.5 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600">저장</button>
                    ) : (
                      <button onClick={() => handleEdit(item.id)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200">수정</button>
                    )}
                    <button onClick={() => handleDelete(item.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded text-sm font-medium hover:bg-red-100">삭제</button>
                  </div>
                </div>

                <div className="mt-2">
                  <span className="block text-gray-500 font-medium text-sm mb-1">제출 양식 (텍스트 입력) :</span>
                  {isEditing ? (
                    <textarea 
                      value={item.submissionForm || ''} 
                      onChange={(e) => handleLocalChange(item.id, 'submissionForm', e.target.value)} 
                      rows={5}
                      placeholder="여기에 제출 양식을 자유롭게 입력하세요."
                      className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-y"
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