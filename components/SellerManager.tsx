'use client';

import { useState, useEffect, useTransition } from 'react';
import { addSeller, updateSeller, deleteSeller } from '@/app/actions/info';

type SellerInfo = {
  id: string;
  companyName: string;
  submissionForm: string;
};

export default function SellerManager({ initialData }: { initialData: SellerInfo[] }) {
  const [localData, setLocalData] = useState<SellerInfo[]>(initialData);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalData(initialData);
  }, [initialData]);

  const handleAdd = () => {
    startTransition(async () => {
      await addSeller();
    });
  };

  const handleLocalChange = (id: string, field: keyof SellerInfo, value: string) => {
    setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleEdit = (id: string) => setEditingIds(prev => new Set(prev).add(id));

  const handleSave = (item: SellerInfo) => {
    startTransition(async () => {
      await updateSeller(item.id, item);
      setEditingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('이 판매자 정보를 삭제하시겠습니까?')) {
      startTransition(() => deleteSeller(id));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">🏢 판매자 정보 관리</h2>
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + 업체 추가
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
                      <input type="text" value={item.companyName} onChange={(e) => handleLocalChange(item.id, 'companyName', e.target.value)} placeholder="업체명 입력" className="flex-1 p-1.5 border rounded outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold" />
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
                      value={item.submissionForm} 
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