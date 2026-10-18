'use client';

import { useState } from 'react';
import { adminLogin } from '@/app/actions/admin';

export default function AdminLoginPage() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const res = await adminLogin(id, pw);
    if (res.success) {
      window.location.href = '/admin'; // 쿠키 인식용 하드 리다이렉트
    } else {
      alert(res.error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm bg-gray-800 rounded-2xl shadow-2xl overflow-hidden p-8 border border-gray-700">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-white mb-2">🛡️ 시스템 관리자</h1>
          <p className="text-gray-400 text-sm">관리자 계정으로 로그인하세요.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="text" value={id} onChange={(e) => setId(e.target.value)}
            placeholder="Admin ID"
            className="w-full p-3 bg-gray-700 text-white rounded-xl outline-none focus:ring-2 focus:ring-purple-500 border border-gray-600"
            required
          />
          <input
            type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            className="w-full p-3 bg-gray-700 text-white rounded-xl outline-none focus:ring-2 focus:ring-purple-500 border border-gray-600"
            required
          />
          <button
            type="submit" disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md mt-4 disabled:opacity-50"
          >
            {isLoading ? '접속 중...' : '관리자 접속'}
          </button>
        </form>
      </div>
    </div>
  );
}