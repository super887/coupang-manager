'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function ApiKeyForm({ initialHasKey, initialPrompt }: { initialHasKey: boolean, initialPrompt: string }) {
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      // API 라우트나 서버 액션으로 저장 로직 (여기선 기존 saveApiKey를 가정)
      // 간단한 fetch로 업데이트 (이 부분 처리를 위해 /api/user/settings 라우트를 임시 사용하거나 서버 액션 호출)
      await fetch('/api/user/settings', {
        method: 'POST',
        body: JSON.stringify({ apiKey, customPrompt: prompt }),
        headers: { 'Content-Type': 'application/json' }
      });
      router.refresh();
      alert('설정이 저장되었습니다!');
      setApiKey(''); // 보안상 입력창 비우기
    });
  };

  return (
    <form onSubmit={handleSave} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
      <h3 className="text-lg font-semibold mb-4">⚙️ 기본 설정 (API Key & 프롬프트)</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gemini API Key {initialHasKey && '✅ (저장됨)'}</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="새 키를 입력하면 덮어씁니다" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">기본 AI 프롬프트 (제품명이 자동 결합됩니다)</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="예: 이 제품을 직접 사용해본 것처럼 자연스럽고 긍정적인 리뷰를 300자 내외로 작성해 주세요." />
        </div>
      </div>
      <div className="mt-4 text-right">
        <button type="submit" disabled={isPending} className="bg-gray-800 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-900 transition-colors">
          {isPending ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </form>
  );
}