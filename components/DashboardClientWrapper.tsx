'use client';

import { useCachedData } from '@/lib/useCachedData';
import ApiKeyForm from '@/components/ApiKeyForm';
import PurchaseTable from '@/components/PurchaseTable';
import { getDashboardData } from '@/app/actions/info';

interface DashboardState {
  hasApiKey: boolean;
  customPrompt: string;
  accounts: any[];
}

export default function DashboardClientWrapper() {
  const { data, isLoaded } = useCachedData<DashboardState>({
    key: 'optimistic_dashboard',
    initialData: {
      hasApiKey: false,
      customPrompt: '',
      accounts: [],
    },
    fetcher: async () => {
      const res = await getDashboardData();
      return (
        res || {
          hasApiKey: false,
          customPrompt: '',
          accounts: [],
        }
      );
    },
  });

  return (
    <div className={!isLoaded ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}>
      {/* 바로가기 버튼 및 쿠팡 배너 검색 영역 */}
      <div className="mb-6 flex flex-col xl:flex-row justify-between items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-3 w-full xl:w-auto">
          {/* 쿠팡 바로가기 */}
          <a
            href="https://link.coupang.com/a/hWThgSlpCu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group shadow-sm"
          >
            <span className="text-xl">🚀</span>
            <span className="font-bold text-gray-700 group-hover:text-blue-700 text-sm transition-colors">
              쿠팡
            </span>
          </a>

          {/* 네이버 */}
          <a
            href="https://www.naver.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-400 hover:bg-green-50 transition-all group shadow-sm"
          >
            <span className="text-xl font-black text-green-600">N</span>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">
              네이버
            </span>
          </a>

          {/* 지마켓 */}
          <a
            href="https://www.gmarket.co.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-500 hover:bg-green-50 transition-all group shadow-sm"
          >
            <span className="text-xl font-black text-green-700">G</span>
            <span className="font-bold text-gray-700 group-hover:text-green-700 text-sm transition-colors">
              지마켓
            </span>
          </a>

          {/* 11번가 */}
          <a
            href="https://www.11st.co.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-red-500 hover:bg-red-50 transition-all group shadow-sm"
          >
            <span className="text-xl font-black text-red-600">11</span>
            <span className="font-bold text-gray-700 group-hover:text-red-700 text-sm transition-colors">
              11번가
            </span>
          </a>
        </div>

        {/* 오른쪽: 쿠팡 파트너스 검색창 */}
        <div className="w-full xl:w-[300px] h-[75px] rounded-xl overflow-hidden flex items-center justify-center xl:justify-end border border-gray-100 shadow-sm flex-shrink-0">
          <iframe
            src="https://coupa.ng/cqe0B2"
            width="100%"
            height="75"
            frameBorder="0"
            scrolling="no"
            referrerPolicy="unsafe-url"
            title="쿠팡 상품 검색"
            className="w-full h-full"
          />
        </div>
      </div>

      {/* API 키 폼 영역 */}
      <ApiKeyForm
        key={`api-form-${data.hasApiKey}`}
        initialHasKey={data.hasApiKey}
        initialPrompt={data.customPrompt}
      />

      {/* 구매 내역 테이블 영역 */}
      <div className="mt-6">
        <PurchaseTable accounts={data.accounts} hasApiKey={data.hasApiKey} />
      </div>
    </div>
  );
}
