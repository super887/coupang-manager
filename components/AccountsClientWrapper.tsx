'use client';

import { useCachedData } from '@/lib/useCachedData';
import AccountManager from '@/components/AccountManager';
import SellerManager from '@/components/SellerManager';
import { getAccounts, getSellers } from '@/app/actions/info';

interface AccountsState {
  accounts: any[];
  sellers: any[];
}

export default function AccountsClientWrapper() {
  const { data, isLoaded } = useCachedData<AccountsState>({
    key: 'optimistic_accounts_and_sellers',
    initialData: { accounts: [], sellers: [] },
    fetcher: async () => {
      const [accData, selData] = await Promise.all([getAccounts(), getSellers()]);
      return { accounts: accData || [], sellers: selData || [] };
    },
  });

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64 text-purple-600 font-bold animate-pulse">
        데이터를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <section>
        <AccountManager initialData={data.accounts} />
      </section>
      <section>
        <SellerManager initialData={data.sellers} />
      </section>
    </div>
  );
}
