'use client';

import { useState, useEffect } from 'react';
import AccountManager from '@/components/AccountManager';
import SellerManager from '@/components/SellerManager';
import { getAccounts, getSellers } from '@/app/actions/info';

export default function AccountsClientWrapper() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // 1. 접속하자마자 내 컴퓨터(브라우저 캐시)에 저장된 데이터를 꺼내서 즉시 화면에 렌더링! (0초 컷)
    const cachedAccounts = localStorage.getItem('optimistic_accounts');
    const cachedSellers = localStorage.getItem('optimistic_sellers');
    
    if (cachedAccounts) setAccounts(JSON.parse(cachedAccounts));
    if (cachedSellers) setSellers(JSON.parse(cachedSellers));
    
    setIsLoaded(true); // 캐시가 있든 없든 껍데기는 바로 보여줌

    // 2. 화면을 띄워놓고, 뒤에서 몰래 최신 데이터를 가져와서 덮어쓰기 (사용자는 로딩을 전혀 못 느낌)
    const fetchLatestData = async () => {
      try {
        const [accData, selData] = await Promise.all([getAccounts(), getSellers()]);
        
        setAccounts(accData);
        setSellers(selData);
        
        // 새로 가져온 최신 데이터를 다음 접속을 위해 컴퓨터에 다시 저장
        localStorage.setItem('optimistic_accounts', JSON.stringify(accData));
        localStorage.setItem('optimistic_sellers', JSON.stringify(selData));
      } catch (error) {
        console.error('최신 데이터 동기화 실패:', error);
      }
    };

    fetchLatestData();
  }, []);

  // 캐시조차 없는 최초 1회 접속 시 아주 짧게 보여줄 뼈대
  if (!isLoaded) {
    return <div className="flex items-center justify-center h-64 text-purple-600 font-bold animate-pulse">데이터를 불러오는 중입니다...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <section>
        <AccountManager initialData={accounts} />
      </section>
      <section>
        <SellerManager initialData={sellers} />
      </section>
    </div>
  );
}