'use client';

import { useState, useEffect } from 'react';
import { getAdminDashboardData, updateUserRole } from '@/app/actions/admin';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const result = await getAdminDashboardData();
      setData(result);
      setUsers(result.users);
    };
    fetchData();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!confirm(`해당 유저의 상태를 [${newRole}]로 변경하시겠습니까?`)) return;

    // ✨ 낙관적 UI 업데이트: 서버 응답 기다리지 않고 화면부터 즉각 변경!
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));

    try {
      await updateUserRole(userId, newRole);
    } catch (error) {
      alert('상태 변경에 실패했습니다.');
      // 에러 시 원래 상태로 복구
      const result = await getAdminDashboardData();
      setUsers(result.users);
    }
  };

  if (!data) return <div className="min-h-screen flex items-center justify-center bg-gray-100 font-bold text-xl">로딩 중...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-8 flex items-center gap-2">
          🛡️ 시스템 관리자 대시보드
        </h1>

        {/* 최상단 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <p className="text-gray-500 font-semibold mb-1">총 가입 유저</p>
            <p className="text-3xl font-black text-purple-600">{data.totalUsers}명</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <p className="text-gray-500 font-semibold mb-1">누적 등록 상품</p>
            <p className="text-3xl font-black text-blue-600">{data.totalPurchases}건</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <p className="text-gray-500 font-semibold mb-1">작성된 AI 리뷰</p>
            <p className="text-3xl font-black text-green-600">{data.totalReviews}건</p>
          </div>
        </div>

        {/* 유저 관리 테이블 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800">👤 전체 유저 데이터베이스</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">가입일</th>
                  <th className="px-6 py-4">이름(닉네임)</th>
                  <th className="px-6 py-4">전화번호</th>
                  <th className="px-6 py-4 text-center">등록 상품</th>
                  <th className="px-6 py-4 text-center">리뷰 생성</th>
                  <th className="px-6 py-4 text-center">API 키</th>
                  <th className="px-6 py-4 text-center">권한 및 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500">{user.createdAt}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{user.name}</td>
                    <td className="px-6 py-4 font-medium">{user.phone}</td>
                    <td className="px-6 py-4 text-center font-bold text-blue-600">{user.purchaseCount}</td>
                    <td className="px-6 py-4 text-center font-bold text-green-600">{user.reviewCount}</td>
                    <td className="px-6 py-4 text-center">
                      {user.hasApiKey ? <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">등록완료</span> 
                                      : <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">미등록</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <select 
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className={`text-xs font-bold outline-none border rounded-lg p-1.5 cursor-pointer transition-colors ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                          user.role === 'banned' ? 'bg-red-100 text-red-700 border-red-200' :
                          'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <option value="user">일반 유저</option>
                        <option value="admin">관리자</option>
                        <option value="banned">차단됨 (접속불가)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}