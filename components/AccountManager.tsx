'use client';

import { useState, useEffect } from 'react';
import { addAccount, updateAccount, deleteAccount } from '@/app/actions/info';

type AccountInfo = {
  id: string;
  platform: string;
  accountHolder: string;
  recipient1: string;
  recipient2: string;
  recipient3: string;
  loginId: string;
  phoneNumber: string;
  address1: string;
  address2: string;
  address3: string;
  paybackAccount1: string;
  paybackAccount2: string;
};

export default function AccountManager({ initialData }: { initialData: AccountInfo[] }) {
  const [localData, setLocalData] = useState<AccountInfo[]>(initialData);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false); // ✨ 새 항목 추가 잠금 상태

  useEffect(() => {
    setLocalData(initialData);
  }, [initialData]);

  // 🛡️ 안전한 통신: 계정 추가 (가짜 ID 방지 및 광클 차단)
  const handleAdd = async () => {
    setIsAdding(true);
    try {
      const newAccount = await addAccount();
      // 서버에서 진짜 ID가 발급된 새 계정을 받아와서 즉시 화면 맨 위에 추가!
      setLocalData(prev => [newAccount as unknown as AccountInfo, ...prev]);
    } catch (error) {
      console.error('추가 실패:', error);
      alert('계정 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleLocalChange = (id: string, field: keyof AccountInfo, value: string) => {
    // 키보드 입력 시 화면은 0.01초 만에 즉시 변경 (에러 없음)
    setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleEdit = (id: string) => setEditingIds(prev => new Set(prev).add(id));

  // 🚀 낙관적 업데이트 1: 저장 (0.1초 컷)
  const handleSave = async (item: AccountInfo) => {
    // 이미 화면은 입력한 대로 바뀌어 있으니, 수정 모드(노란불)만 즉시 꺼줍니다.
    setEditingIds(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });

    try {
      // 뒤에서 조용히 서버로 데이터 업데이트
      await updateAccount(item.id, item);
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
    if (!confirm('이 계정 정보를 삭제하시겠습니까?')) return;

    const previousData = [...localData];
    // 화면에서 즉시 삭제 (로딩 X)
    setLocalData(prev => prev.filter(item => item.id !== id));

    try {
      // 몰래 서버 삭제 진행
      await deleteAccount(id);
    } catch (error) {
      console.error('삭제 실패:', error);
      setLocalData(previousData); // 실패 시 화면 복구
      alert('삭제에 실패했습니다.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">👤 계정 정보 관리</h2>
        <button
          onClick={handleAdd}
          disabled={isAdding}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-[120px]"
        >
          {isAdding ? '⏳ 추가 중...' : '+ 계정 추가'}
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto bg-gray-50/50 space-y-4">
        {localData.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">등록된 계정이 없습니다.</div>
        ) : (
          localData.map((item) => {
            const isEditing = editingIds.has(item.id);
            return (
              <div key={item.id} className={`p-4 rounded-xl border transition-all ${isEditing ? 'bg-yellow-50/30 border-blue-300 shadow-md' : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'}`}>
                {/* 카드 헤더 (계정주 표기) */}
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                  <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                    {isEditing ? (
                      <input type="text" value={item.accountHolder} onChange={(e) => handleLocalChange(item.id, 'accountHolder', e.target.value)} placeholder="계정주 이름 (예: 김수연)" className="p-1.5 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-base" />
                    ) : (
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">{item.accountHolder || '이름 없음'}</span>
                    )}
                  </h3>
                  <div className="flex gap-2">
                    {isEditing ? (
                      <button onClick={() => handleSave(item)} className="px-3 py-1.5 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600">저장</button>
                    ) : (
                      <button onClick={() => handleEdit(item.id)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200">수정</button>
                    )}
                    <button onClick={() => handleDelete(item.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded text-sm font-medium hover:bg-red-100">삭제</button>
                  </div>
                </div>

                {/* 입력 필드 그리드 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <FieldRow label="플랫폼" value={item.platform} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'platform', v)} />
                  <FieldRow label="아이디" value={item.loginId} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'loginId', v)} />
                  
                  <FieldRow label="수취인 1" value={item.recipient1} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'recipient1', v)} />
                  <FieldRow label="전화번호" value={item.phoneNumber} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'phoneNumber', v)} />
                  
                  <FieldRow label="수취인 2" value={item.recipient2} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'recipient2', v)} />
                  <FieldRow label="페이백계좌 1" value={item.paybackAccount1} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'paybackAccount1', v)} />
                  
                  <FieldRow label="수취인 3" value={item.recipient3} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'recipient3', v)} />
                  <FieldRow label="페이백계좌 2" value={item.paybackAccount2} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'paybackAccount2', v)} />

                  {/* 주소는 2칸(전체 너비) 차지하도록 합침 */}
                  <div className="col-span-2 space-y-2 mt-2 pt-2 border-t border-gray-50">
                    <FieldRow label="주소 1" value={item.address1} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'address1', v)} fullWidth />
                    <FieldRow label="주소 2" value={item.address2} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'address2', v)} fullWidth />
                    <FieldRow label="주소 3" value={item.address3} isEditing={isEditing} onChange={(v) => handleLocalChange(item.id, 'address3', v)} fullWidth />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// 재사용 가능한 필드 컴포넌트
function FieldRow({ label, value, isEditing, onChange, fullWidth = false }: { label: string, value: string, isEditing: boolean, onChange: (v: string) => void, fullWidth?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${fullWidth ? 'w-full' : ''}`}>
      <span className="w-24 text-gray-500 font-medium shrink-0">{label}</span>
      {isEditing ? (
        <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} className="flex-1 p-1.5 border rounded outline-none focus:ring-2 focus:ring-blue-500 w-full" />
      ) : (
        <span className="flex-1 text-gray-800 font-medium truncate">{value || '-'}</span>
      )}
    </div>
  );
}