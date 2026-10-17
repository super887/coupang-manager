'use client';

import { useState, useEffect } from 'react';
import { updateApiSettings } from '@/app/actions/info';

export default function ApiKeyForm({ 
  initialHasKey, 
  initialPrompt 
}: { 
  initialHasKey: boolean; 
  initialPrompt: string | null; 
}) {
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem('optimistic_api_settings');
    if (cached) {
      const parsed = JSON.parse(cached);
      setPrompt(parsed.customPrompt || '');
      setHasKey(parsed.hasApiKey ?? initialHasKey);
    } else {
      setPrompt(initialPrompt || '');
    }
  }, [initialHasKey, initialPrompt]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const prevPrompt = prompt;
    const prevHasKey = hasKey;

    const newHasKey = apiKey.trim() !== '' ? true : prevHasKey;
    setHasKey(newHasKey);
    localStorage.setItem('optimistic_api_settings', JSON.stringify({
      hasApiKey: newHasKey,
      customPrompt: prompt
    }));

    try {
      await updateApiSettings(apiKey, prompt);
      setApiKey(''); 
      alert('설정이 성공적으로 저장되었습니다!');
    } catch (error) {
      setPrompt(prevPrompt);
      setHasKey(prevHasKey);
      localStorage.setItem('optimistic_api_settings', JSON.stringify({
        hasApiKey: prevHasKey,
        customPrompt: prevPrompt
      }));
      alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
      <div className="flex flex-col xl:flex-row gap-8 items-start">
        
        {/* 💡 초보자를 위한 친절한 이미지 가이드 및 발급 버튼 영역 */}
        <div className="w-full xl:w-1/2 space-y-4">
          
          {/* ✨ 타이틀 및 완전무료 강조 배지 + 버튼 */}
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-gray-800">🔑 Gemini API 키 설정</h3>
              
              {/* 💸 돈 굳는 완전무료 강조 배지 (통통 튀는 애니메이션 적용) */}
              <span className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-full text-[13px] font-extrabold shadow-sm flex items-center gap-1.5">
                <span className="animate-bounce inline-block">💸</span> 
                AI사용 완전무료! (리뷰작성 500건)
              </span>
            </div>
            
            <a 
              href="https://aistudio.google.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-1"
            >
              🚀 API Key 받으러 가기
            </a>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mt-2">
            <p className="text-sm text-gray-600 font-medium mb-3">
              위 버튼을 눌러 Google AI Studio에 접속한 후, 아래 이미지처럼 <span className="text-red-500 font-bold">복사 버튼</span>을 클릭하세요.
            </p>
            <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <img src="/key.png" alt="API 키 복사 가이드" className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>

        {/* 📝 입력 폼 영역 */}
        <div className="w-full xl:w-1/2 space-y-4 xl:mt-14">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                API 키 입력 {hasKey && <span className="text-green-500 text-xs ml-2">(✅ 현재 저장된 키가 있습니다)</span>}
              </label>
              <input
                type="text" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Ctrl + V 를 입력하여 키를 입력해주세요"
                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-medium text-sm transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                AI 리뷰 맞춤 프롬프트 (선택)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 항상 밝고 긍정적인 톤으로, 20대 여성이 작성한 것처럼 리뷰를 써줘."
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-medium text-sm transition-shadow resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button 
                type="submit" 
                disabled={isSaving}
                className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '설정 저장'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}