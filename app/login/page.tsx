'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, signup } from '@/app/actions/auth';

export default function LoginPage() {
  const router = useRouter();
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLoginMode) {
        const res = await login(phone, password);
        if (res.success) {
          router.push('/');
        } else {
          alert(res.error);
        }
      } else {
        const res = await signup(name, phone, password);
        if (res.success) {
          alert('회원가입이 완료되었습니다!');
          router.push('/');
        } else {
          alert(res.error);
        }
      }
    } catch (error) {
      alert('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  // ✨ 비밀번호 찾기 클릭 시 카카오 비즈니스 채널로 유도
  const handleFindPassword = () => {
    if (confirm('비밀번호 초기화는 카카오톡 고객센터를 통해 진행됩니다.\n1:1 상담 채널로 이동하시겠습니까?')) {
      window.open('http://pf.kakao.com/_pxjsmX/chat', '_blank');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* 상단 탭 전환 */}
        <div className="flex border-b">
          <button 
            type="button"
            onClick={() => setIsLoginMode(true)}
            className={`flex-1 py-4 font-bold transition-colors ${isLoginMode ? 'bg-white text-purple-600 border-b-2 border-purple-600' : 'bg-gray-50 text-gray-400'}`}
          >
            로그인
          </button>
          <button 
            type="button"
            onClick={() => setIsLoginMode(false)}
            className={`flex-1 py-4 font-bold transition-colors ${!isLoginMode ? 'bg-white text-purple-600 border-b-2 border-purple-600' : 'bg-gray-50 text-gray-400'}`}
          >
            회원가입
          </button>
        </div>

        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">리뷰오토 📦</h1>
            <p className="text-gray-500 text-sm">
              {isLoginMode ? '다시 오신 것을 환영합니다!' : '지금 바로 쿠팡 리뷰 관리를 시작하세요.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoginMode && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">이름(닉네임)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors"
                  required={!isLoginMode}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">전화번호</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="- 없이 숫자만 입력 (예: 01012345678)"
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-bold text-gray-700">비밀번호</label>
                {isLoginMode && (
                  <button type="button" onClick={handleFindPassword} className="text-xs text-purple-600 hover:text-purple-800 font-bold">
                    비밀번호를 잊으셨나요?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력해주세요"
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md mt-6 disabled:opacity-50"
            >
              {isLoading ? '처리 중...' : (isLoginMode ? '로그인' : '회원가입')}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}