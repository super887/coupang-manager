'use client';

import { useState } from 'react';
import { login, signup } from '@/app/actions/auth';

export default function LoginPage() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false); // ✨ 낙관적 UI 전환을 위한 성공 상태 추가!

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 로딩 중이거나 이미 성공했으면 중복 클릭 완벽 차단
    if (isLoading || isSuccess) return; 

    if (!isLoginMode && password !== confirmPassword) {
      alert('비밀번호가 일치하지 않습니다. 다시 확인해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      if (isLoginMode) {
        const res = await login(phone, password);
        if (res.success) {
          // ✨ 서버에서 성공 응답이 오자마자 낙관적 UI 렌더링!
          setIsSuccess(true); 
          // 그 직후 자연스럽게 리다이렉트
          window.location.href = '/'; 
        } else {
          alert(res.error);
          setIsLoading(false);
        }
      } else {
        const res = await signup(name, phone, password);
        if (res.success) {
          setIsSuccess(true);
          window.location.href = '/';
        } else {
          alert(res.error);
          setIsLoading(false);
        }
      }
    } catch (error) {
      alert('오류가 발생했습니다. 다시 시도해주세요.');
      setIsLoading(false);
    }
  };

  const handleFindPassword = () => {
    if (confirm('비밀번호 초기화는 카카오톡 고객센터를 통해 진행됩니다.\n1:1 상담 채널로 이동하시겠습니까?')) {
      window.open('http://pf.kakao.com/_pxjsmX/chat', '_blank');
    }
  };

  // ✨ 낙관적 UI 전환: 로그인이 성공하면 즉시 보여줄 화면 (광클 방지 및 UX 극대화)
  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden p-12 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-6"></div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">환영합니다!</h2>
          <p className="text-gray-500 font-medium text-center">대시보드 데이터를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* 상단 탭 전환 */}
        <div className="flex border-b">
          <button 
            type="button"
            onClick={() => {
              setIsLoginMode(true);
              setPassword('');
              setConfirmPassword('');
            }}
            disabled={isLoading}
            className={`flex-1 py-4 font-bold transition-colors ${isLoginMode ? 'bg-white text-purple-600 border-b-2 border-purple-600' : 'bg-gray-50 text-gray-400'} disabled:opacity-50`}
          >
            로그인
          </button>
          <button 
            type="button"
            onClick={() => {
              setIsLoginMode(false);
              setPassword('');
              setConfirmPassword('');
            }}
            disabled={isLoading}
            className={`flex-1 py-4 font-bold transition-colors ${!isLoginMode ? 'bg-white text-purple-600 border-b-2 border-purple-600' : 'bg-gray-50 text-gray-400'} disabled:opacity-50`}
          >
            회원가입
          </button>
        </div>

        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">리뷰오토 📦</h1>
            <p className="text-gray-500 text-sm">
              {isLoginMode ? '다시 오신 것을 환영합니다!' : '지금 바로 리뷰 관리를 시작하세요.'}
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
                  disabled={isLoading}
                  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors disabled:bg-gray-100 disabled:text-gray-400"
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
                disabled={isLoading}
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors disabled:bg-gray-100 disabled:text-gray-400"
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
                disabled={isLoading}
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                required
              />
            </div>

            {!isLoginMode && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 다시 한 번 입력해주세요"
                  disabled={isLoading}
                  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                  required={!isLoginMode}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  처리 중...
                </>
              ) : (
                isLoginMode ? '로그인' : '회원가입'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}