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
    <div className="flex flex-col h-full gap-6"> {/* ✨ 공간 띄우기 위해 레이아웃 재조정 */}
      
      {/* ✨ 플랫폼 바로가기 & 우측 쿠팡 파트너스 검색창 ✨ */}
      <div className="flex flex-col xl:flex-row justify-between items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-gray-200">
        
        {/* 왼쪽: 버튼들 */}
        <div className="flex flex-wrap gap-3 w-full xl:w-auto">
          {/* 쿠팡 */}
          <a href="https://link.coupang.com/a/hWThgSlpCu" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="data:image/png;base64,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" alt="Coupang" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-blue-700 text-sm transition-colors">🚀 쿠팡(할인)</span>
          </a>
          {/* 네이버 */}
          <a href="https://www.naver.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-400 hover:bg-green-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcBAMAAACAI8KnAAAAMFBMVEUeyAAAxQAAxADs+ev////6//m467Pi9uHD7r6x6KuC3XgmygrU89CQ4Iin5qHJ8cMfkHdFAAAAYUlEQVR4AWOgKRBSUgIRihAeo4mLKwNjiouzAIRb4uLSxDjFxR3B9RJE4bpsROUeQuX6PkHhunxB4voD+UhcvysoXE8dVK40KldwCQpXQALBNXFxE2AIgXoB6jclIEFLAAD2tiUhfIzieAAAAABJRU5ErkJggg==" alt="Naver" className="w-full h-full object-cover p-1" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">네이버</span>
          </a>
          {/* 지마켓 */}
          <a href="https://www.gmarket.co.kr/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-500 hover:bg-green-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="https://blog.kakaocdn.net/dna/UIGeR/btsrsRIruv5/AAAAAAAAAAAAAAAAAAAAADL-V5RuANqZCBbmB1nfPUBHhPnlaiQkiZjOsh2H8qCv/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1793458799&allow_ip=&allow_referer=&signature=5xg4LbafYGjRmlGtNYT2HKyoz6I%3D" alt="Gmarket" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">지마켓</span>
          </a>
          {/* 11번가 */}
          <a href="https://www.11st.co.kr/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-red-500 hover:bg-red-50 transition-all group shadow-sm">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-white border border-gray-100 group-hover:scale-110 transition-transform">
              <img src="https://i.namu.wiki/i/Hoj-MVl7c1jGLFuXwYHtyTZ0GgGEvsOxKeJ2wNlqF6bEo9pvzGIgb0YN6bnNfoO-IufDLE0M2j0vRk8BJo042Ipo-hCiBsZ1ojt6AOJgmJ9-dFm-mVcySPxLowRzVHVyuZ-eJYkUnoloRdl6wIYsgg.svg" alt="11st" className="w-full h-full object-cover p-1" />
            </div>
            <span className="font-bold text-gray-700 group-hover:text-red-700 text-sm transition-colors">11번가</span>
          </a>
        </div>

        {/* 오른쪽: 쿠팡 파트너스 검색창 */}
        <div className="w-full xl:w-[300px] h-[75px] rounded-xl overflow-hidden flex items-center justify-center xl:justify-end border border-gray-100 shadow-sm flex-shrink-0">
          <iframe src="https://coupa.ng/cqe0B2" width="100%" height="75" frameBorder="0" scrolling="no" referrerPolicy="unsafe-url" title="쿠팡 상품 검색" className="w-full h-full"></iframe>
        </div>
      </div>

      {/* 기존 판매자 정보 관리 컨테이너 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1">
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
    </div>
  );
}