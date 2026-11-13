'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  addPurchase,
  updatePurchase,
  deletePurchase,
  deletePurchases,
  duplicatePurchase,
  getPaginatedPurchases,
} from '@/app/actions/purchase';
import { generateAiReview, selectPositiveSurveyOptions } from '@/app/actions/ai';
import {
  splitReviewCandidates,
  extractCleanReview,
  extractFirstSentences,
  isValidThreeStyleReview,
} from '@/lib/review-parser';

// 🛡️ 절대 안 터지는 안전 변환 함수들
const getStr = (val: any) => (val === null || val === undefined ? '' : String(val));

// 연결된 계정주("김수연" 또는 쿠팡 마스킹 이름 "김*연")와 행의 계정주가 일치하는지 판별
const isAccountHolderMatch = (rowHolder: string, connectedAccount: string): boolean => {
  const exp = getStr(rowHolder).replace(/\s+/g, '').replace(/님$/, '');
  const det = getStr(connectedAccount).replace(/\s+/g, '').replace(/님$/, '');
  if (!exp || !det) return true;
  if (exp === det) return true;
  if (det.includes('*')) {
    if (exp[0] !== det[0]) return false;
    const lastDet = det[det.length - 1];
    if (lastDet !== '*' && exp[exp.length - 1] !== lastDet) return false;
    return true;
  }
  return exp.includes(det) || det.includes(exp);
};

// ✨ 리액트 환경에서 완벽하게 격리된 쿠팡 파트너스 전용 컴포넌트 (iframe 샌드박스)
const CoupangBanner = () => {
  const iframeHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            background-color: #f9fafb; /* 배경색 맞춤 (gray-50) */
          }
        </style>
      </head>
      <body>
        <script src="https://ads-partners.coupang.com/g.js"></script>
        <script>
          new PartnersCoupang.G({"id":1040729,"template":"carousel","trackingCode":"AF5941029","width":"680","height":"140","tsource":""});
        </script>
      </body>
    </html>
  `;

  return (
    <div className="w-full flex justify-center overflow-hidden">
      <iframe
        srcDoc={iframeHtml}
        width="680"
        height="140"
        frameBorder="0"
        scrolling="no"
        className="max-w-full"
        style={{ border: 'none', backgroundColor: 'transparent' }}
      />
    </div>
  );
};

export default function PurchaseTable({
  accounts = [],
  hasApiKey,
}: {
  accounts: any[];
  hasApiKey?: boolean;
}) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchField, setSearchField] = useState('productName');
  const [appliedField, setAppliedField] = useState('productName');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [localData, setLocalData] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [hideSpinner, setHideSpinner] = useState(false);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [modalReview, setModalReview] = useState<{
    id: string;
    productName?: string;
    originalText: string;
    currentText: string;
    selectedStyle: number | 'all';
  } | null>(null);
  const [isRegeneratingInModal, setIsRegeneratingInModal] = useState(false);

  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const cancelBulkRef = useRef(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addCountInput, setAddCountInput] = useState<string>('1');

  // 🚀 크롬 확장 프로그램 연동 상태
  const [isExtInstalled, setIsExtInstalled] = useState(false);
  const [assignedExtAccount, setAssignedExtAccount] = useState('');
  const [showExtGuideModal, setShowExtGuideModal] = useState(false);
  const [isAutoRegistering, setIsAutoRegistering] = useState(false);
  const [autoRegState, setAutoRegState] = useState<{
    current: number;
    total: number;
    productName: string;
    accountHolder: string;
    stepText: string;
    activeRowId: string;
  }>({
    current: 0,
    total: 0,
    productName: '',
    accountHolder: '',
    stepText: '',
    activeRowId: '',
  });
  const cancelAutoRegRef = useRef(false);
  const pendingExtResolverRef = useRef<
    ((res: {
      success: boolean;
      skipped?: boolean;
      error?: string;
      fileName?: string;
      detectedAccountName?: string;
    }) => void) | null
  >(null);

  // 토스트 알림 상태
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(
    null
  );
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (text: string, type: 'info' | 'success' | 'error' = 'info') => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMsg({ text, type });
      toastTimerRef.current = setTimeout(() => {
        setToastMsg(null);
      }, 4500);
    },
    []
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPaginatedPurchases({
        page: currentPage,
        pageSize: 100,
        searchField: appliedField,
        searchKeyword: appliedSearch,
        isCompleted: activeTab === 'completed',
      });
      setLocalData(data.items || []);
      setTotalPages(data.totalPages || 1);
      setSelectedRows(new Set());
    } catch (error) {
      console.error('데이터 불러오기 실패:', error);
    } finally {
      setIsLoading(false);
      setHideSpinner(false);
    }
  }, [currentPage, appliedField, appliedSearch, activeTab]);

  useEffect(() => {
    fetchData();
  }, [currentPage, appliedField, appliedSearch, searchTrigger, activeTab, fetchData]);

  // 크롬 확장 프로그램 감지 및 메시지 수신 리스너
  useEffect(() => {
    const checkDomAttr = () => {
      const installed =
        document.documentElement.getAttribute('data-coupang-ext-installed') === 'true';
      if (installed) setIsExtInstalled(true);
      return installed;
    };

    checkDomAttr();

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data || typeof event.data.type !== 'string') {
        return;
      }
      const { type, payload } = event.data;

      if (type === 'CP_EXT_PONG') {
        setIsExtInstalled(true);
        if (payload?.assignedAccount !== undefined) {
          setAssignedExtAccount(payload.assignedAccount || '');
        }
      } else if (type === 'CP_EXT_REVIEW_PROGRESS') {
        if (payload?.stepText) {
          setAutoRegState((prev) => ({ ...prev, stepText: payload.stepText }));
        }
      } else if (type === 'CP_EXT_REVIEW_RESULT') {
        if (pendingExtResolverRef.current) {
          const resolve = pendingExtResolverRef.current;
          pendingExtResolverRef.current = null;
          resolve({
            success: Boolean(payload?.success),
            skipped: Boolean(payload?.skipped),
            error: payload?.error,
            fileName: payload?.fileName,
            detectedAccountName: payload?.detectedAccountName,
          });
        }
      } else if (type === 'CP_EXT_SURVEY_AI_REQ') {
        const surveyReqId = payload?.surveyReqId;
        (async () => {
          try {
            const aiRes = await selectPositiveSurveyOptions(
              getStr(payload?.productName),
              Array.isArray(payload?.questions) ? payload.questions : []
            );
            window.postMessage(
              {
                type: 'CP_EXT_SURVEY_AI_RES',
                payload: {
                  surveyReqId,
                  success: aiRes.success,
                  selections: aiRes.selections || {},
                },
              },
              '*'
            );
          } catch {
            window.postMessage(
              {
                type: 'CP_EXT_SURVEY_AI_RES',
                payload: { surveyReqId, success: false, selections: {} },
              },
              '*'
            );
          }
        })();
      }
    };

    window.addEventListener('message', handleWindowMessage);

    // 확장 프로그램에 Ping 및 계정주 목록 전달
    const knownAccounts = safeAccounts
      .map((a) => getStr(a?.accountHolder).trim())
      .filter(Boolean);
    window.postMessage({ type: 'CP_EXT_PING', payload: { knownAccounts } }, '*');

    const timer = setTimeout(() => {
      checkDomAttr();
      window.postMessage({ type: 'CP_EXT_PING', payload: { knownAccounts } }, '*');
    }, 800);

    return () => {
      window.removeEventListener('message', handleWindowMessage);
      clearTimeout(timer);
    };
  }, [safeAccounts]);

  const executeSearch = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setCurrentPage(1);
    setAppliedField(searchField);
    setAppliedSearch(searchInput);
    setSearchTrigger((prev) => prev + 1);
  };

  const resetSearch = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setCurrentPage(1);
    setSearchInput('');
    setAppliedSearch('');
    setAppliedField(searchField);
    setSearchTrigger((prev) => prev + 1);
  };

  const changeTab = (e: React.MouseEvent, tab: 'progress' | 'completed') => {
    e.preventDefault();
    if (activeTab === tab) return;
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchInput('');
    setAppliedSearch('');
    setAppliedField(searchField);
  };

  const handleLocalChange = (id: string, field: string, value: any) => {
    setLocalData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingRows((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleCheckChange = async (id: string, field: string, value: boolean) => {
    const row = localData.find((r) => r.id === id);
    if (!row) return;

    const updatedRow = { ...row, [field]: value };
    const isNowCompleted =
      updatedRow.isReviewWritten && updatedRow.isProductPayback && updatedRow.isReviewPayback;
    const shouldVanish =
      (activeTab === 'progress' && isNowCompleted) ||
      (activeTab === 'completed' && !isNowCompleted);

    if (shouldVanish) setLocalData((prev) => prev.filter((r) => r.id !== id));
    else setLocalData((prev) => prev.map((r) => (r.id === id ? updatedRow : r)));

    try {
      await updatePurchase(id, { [field]: value });
    } catch {
      alert('상태 업데이트에 실패했습니다.');
      fetchData();
    }
  };

  const handleCopy = async (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    await navigator.clipboard.writeText(text);
    showToast('📋 클립보드에 복사되었습니다!', 'success');
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedRows.size === localData.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(localData.map((r) => r.id)));
  };

  const handleGenerateAi = async (e: React.MouseEvent, id: string, productName: string) => {
    e.preventDefault();

    if (!hasApiKey) {
      alert('api키가 입력 되지않았습니다. gemini api 키 설정 화면을 참고해 api 키를 입력해주세요');
      return;
    }

    const trimmedName = getStr(productName).trim();

    try {
      const generatedText = await generateAiReview(id, trimmedName);
      const sameProductUnwritten = localData.filter(
        (r) =>
          r.id !== id &&
          !r.isReviewWritten &&
          (r.reviewType === '(빈)텍스트' || getStr(r.reviewType).includes('한줄')) &&
          getStr(r.productName).trim() === trimmedName &&
          (!r.generatedReview || !isValidThreeStyleReview(getStr(r.generatedReview)))
      );
      for (const other of sameProductUnwritten) {
        await updatePurchase(other.id, { generatedReview: generatedText });
      }
      const updatedIds = new Set([id, ...sameProductUnwritten.map((r) => r.id)]);
      setLocalData((prev) =>
        prev.map((r) => (updatedIds.has(r.id) ? { ...r, generatedReview: generatedText } : r))
      );
      await updatePurchase(id, { generatedReview: generatedText });
      showToast('✨ 3가지 스타일 AI 리뷰가 생성되었습니다!', 'success');
    } catch (e: any) {
      const errorMsg = e?.message?.toLowerCase() || String(e).toLowerCase();
      let reason = '알 수 없는 오류';
      if (
        errorMsg.includes('safety') ||
        errorMsg.includes('policy') ||
        errorMsg.includes('violation') ||
        errorMsg.includes('안전')
      )
        reason = '보안 정책 위반(성인용품 등)';
      else if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('한도'))
        reason = '요청 한도 초과';

      alert(`AI 리뷰 생성에 실패했습니다.\n사유: ${reason}`);
    }
  };

  const handleBulkGenerateAi = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (!hasApiKey) {
      alert('api키가 입력 되지않았습니다. gemini api 키 설정 화면을 참고해 api 키를 입력해주세요');
      return;
    }

    const targets = localData.filter(
      (r) =>
        !r.isReviewWritten &&
        (r.reviewType === '(빈)텍스트' || getStr(r.reviewType).includes('한줄')) &&
        (!r.generatedReview || !isValidThreeStyleReview(getStr(r.generatedReview))) &&
        (r.productName || '').trim() !== ''
    );
    if (targets.length === 0) return alert('현재 화면에 생성할 대상이 없습니다.');

    let uniqueProductNames = Array.from(
      new Set(targets.map((t) => getStr(t.productName).trim()))
    );
    if (uniqueProductNames.length > 15) {
      alert(`최대 15개 먼저 생성합니다. 완료 후 다시 눌러주세요.`);
      uniqueProductNames = uniqueProductNames.slice(0, 15);
    }
    if (
      !confirm(`총 [${uniqueProductNames.length}개] 고유 상품명에 대해 AI 생성을 시작합니다.`)
    )
      return;

    setIsBulkGenerating(true);
    cancelBulkRef.current = false;

    const failedProducts: { name: string; reason: string }[] = [];

    for (let i = 0; i < uniqueProductNames.length; i++) {
      if (cancelBulkRef.current) break;
      const currentProductName = uniqueProductNames[i];
      setBulkProgress({ current: i + 1, total: uniqueProductNames.length });

      try {
        const matchingRows = targets.filter(
          (t) => getStr(t.productName).trim() === currentProductName
        );
        const sampleId = matchingRows[0].id;
        const generatedText = await generateAiReview(sampleId, currentProductName);

        const otherRows = matchingRows.slice(1);
        for (const row of otherRows) {
          await updatePurchase(row.id, { ...row, generatedReview: generatedText });
        }
        setLocalData((prev) =>
          prev.map((r) =>
            !r.isReviewWritten &&
            (r.reviewType === '(빈)텍스트' || getStr(r.reviewType).includes('한줄')) &&
            (!r.generatedReview || !isValidThreeStyleReview(getStr(r.generatedReview))) &&
            getStr(r.productName).trim() === currentProductName
              ? { ...r, generatedReview: generatedText }
              : r
          )
        );
      } catch (e: any) {
        const errorMsg = e?.message?.toLowerCase() || String(e).toLowerCase();
        let userFriendlyReason = '알 수 없는 시스템 오류 (잠시 후 다시 시도)';

        if (
          errorMsg.includes('safety') ||
          errorMsg.includes('policy') ||
          errorMsg.includes('violation')
        ) {
          userFriendlyReason = '제미나이 보안 정책 위반 (성인용품, 폭력성 단어 등)';
        } else if (
          errorMsg.includes('quota') ||
          errorMsg.includes('429') ||
          errorMsg.includes('too many')
        ) {
          userFriendlyReason = 'API 분당 요청 한도 초과 (잠시 후 다시 시도)';
        } else if (
          errorMsg.includes('fetch') ||
          errorMsg.includes('network') ||
          errorMsg.includes('timeout')
        ) {
          userFriendlyReason = '네트워크 연결 지연 (잠시 후 다시 시도)';
        }

        failedProducts.push({ name: currentProductName, reason: userFriendlyReason });
      }

      if (i < uniqueProductNames.length - 1 && !cancelBulkRef.current)
        await new Promise((res) => setTimeout(res, 5000));
    }

    setIsBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0 });

    if (failedProducts.length > 0) {
      const failedListStr = failedProducts
        .map((f) => `- ${f.name}\n  (사유: ${f.reason})`)
        .join('\n\n');
      alert(
        `✅ 작업이 완료되었으나, 다음 ${failedProducts.length}개 상품은 실패했습니다.\n\n[실패 목록 및 사유]\n${failedListStr}\n\n사유를 확인하신 후 개별 AI 생성 버튼으로 다시 시도하시거나, 보안 위반 상품은 직접 작성해 주세요.`
      );
    } else {
      if (!cancelBulkRef.current)
        alert('✅ 요청하신 AI 리뷰 생성이 완벽하게 완료되었습니다!');
    }
  };

  // 🚀 단일 항목 확장 프로그램 자동등록 실행 헬퍼 (Promise 반환)
  const executeSingleAutoReview = useCallback(
    async (
      row: any
    ): Promise<{
      success: boolean;
      skipped?: boolean;
      error?: string;
      fileName?: string;
      detectedAccountName?: string;
    }> => {
      const productName = getStr(row.productName).trim();
      const accountHolder = getStr(row.accountHolder).trim();
      const reviewType = getStr(row.reviewType).trim();

      // [규칙 0] 이미 리뷰 [작성] 체크가 되어 있는 항목은 쿠팡 리뷰리스트 검수/탐색조차 하지 않고 즉시 패스
      if (row.isReviewWritten) {
        return {
          success: false,
          skipped: true,
          error: '이미 리뷰 [작성] 체크가 완료된 상품입니다.',
        };
      }

      // [규칙 0-1] 현재 확장 프로그램에 연결된 계정주와 행의 계정주가 다르면 쿠팡 탐색 없이 즉시 패스
      if (
        assignedExtAccount &&
        accountHolder &&
        !isAccountHolderMatch(accountHolder, assignedExtAccount)
      ) {
        return {
          success: false,
          skipped: true,
          error: `현재 연결된 계정(${assignedExtAccount})이 아닌 [${accountHolder}] 행이므로 건너뜁니다.`,
        };
      }

      if (!productName) {
        return { success: false, skipped: true, error: '상품명이 비어 있습니다.' };
      }

      // [규칙 1] 포토/사진 리뷰는 자동 작성 스킵
      if (reviewType.includes('포토') || reviewType.includes('사진')) {
        return {
          success: false,
          skipped: true,
          error: '포토 리뷰는 수동 등록 대상입니다.',
        };
      }

      // [규칙 2] 별점 전용인지 텍스트 필요한지 판별
      const isStarOnly = reviewType.includes('별점');
      let cleanReviewText = '';

      if (!isStarOnly) {
        const rawReview = getStr(row.generatedReview).trim();
        if (!rawReview) {
          return {
            success: false,
            skipped: true,
            error: '생성된 AI 리뷰 텍스트가 없습니다. 먼저 AI 리뷰를 생성해주세요.',
          };
        }

        // 1순위: 등록된 계정 순서(최초 등록순: 1번 계정->0, 2번 계정->1, 3번 계정->2)로 고정 매칭
        const orderedAccountHolders = Array.from(
          new Set(
            safeAccounts
              .map((a) => getStr(a?.accountHolder).replace(/\s+/g, ''))
              .filter(Boolean)
          )
        );
        const normalizedHolder = accountHolder.replace(/\s+/g, '');
        const accountIdx = normalizedHolder
          ? orderedAccountHolders.indexOf(normalizedHolder)
          : -1;

        let rowStyleIdx = 0;
        if (accountIdx >= 0) {
          rowStyleIdx = accountIdx;
        } else {
          // 폴백: 등록된 계정에 없는 이름인 경우 동일 상품 행 순서로 분산
          const sameProductRows = localData.filter(
            (r) => getStr(r.productName).trim() === productName
          );
          rowStyleIdx = Math.max(
            0,
            sameProductRows.findIndex((r) => r.id === row.id)
          );
        }
        cleanReviewText = extractCleanReview(rawReview, rowStyleIdx);
        // [한줄텍] 스타일인 경우 해당 계정 순번 리뷰의 앞 2문장만 추출하여 자동 등록
        if (reviewType.includes('한줄')) {
          cleanReviewText = extractFirstSentences(cleanReviewText, 2);
        }
      }

      return new Promise((resolve) => {
        const requestId = `req-${row.id}-${Date.now()}`;
        const timeoutId = setTimeout(() => {
          if (pendingExtResolverRef.current) {
            pendingExtResolverRef.current = null;
            resolve({
              success: false,
              error: '시간 초과(90초): 쿠팡 응답이 없거나 작업이 중단되었습니다.',
            });
          }
        }, 90000);

        pendingExtResolverRef.current = (res) => {
          clearTimeout(timeoutId);
          resolve(res);
        };

        window.postMessage(
          {
            type: 'CP_EXT_START_REVIEW',
            payload: {
              requestId,
              purchaseId: row.id,
              accountHolder,
              productName,
              reviewType,
              reviewText: cleanReviewText,
              purchaseDate: getStr(row.purchaseDate),
              chatRoomName: getStr(row.chatRoomName),
            },
          },
          '*'
        );
      });
    },
    [localData, safeAccounts, assignedExtAccount]
  );

  // 🚀 단건 [자동등록] 버튼 핸들러
  const handleAutoRegisterSingle = async (e: React.MouseEvent, row: any) => {
    e.preventDefault();

    const installed =
      isExtInstalled ||
      document.documentElement.getAttribute('data-coupang-ext-installed') === 'true';
    if (!installed) {
      setShowExtGuideModal(true);
      return;
    }

    if (row.isReviewWritten) {
      showToast('ℹ️ 이미 리뷰 [작성] 체크가 되어 있는 상품입니다. (자동 작성 제외)', 'info');
      return;
    }

    const rowHolder = getStr(row.accountHolder).trim();
    if (
      assignedExtAccount &&
      rowHolder &&
      !isAccountHolderMatch(rowHolder, assignedExtAccount)
    ) {
      showToast(
        `ℹ️ 현재 연결된 계정주(${assignedExtAccount})와 다른 계정주(${rowHolder}) 상품이므로 건너뜁니다.`,
        'info'
      );
      return;
    }

    const reviewType = getStr(row.reviewType).trim();
    if (reviewType.includes('포토') || reviewType.includes('사진')) {
      showToast('📸 포토 리뷰는 수동 등록 대상입니다. (자동 작성 제외)', 'info');
      return;
    }

    if (!getStr(row.productName).trim()) {
      showToast('⚠️ 상품명을 먼저 입력하고 저장해주세요.', 'error');
      return;
    }

    if (!reviewType.includes('별점') && !getStr(row.generatedReview).trim()) {
      showToast('⚠️ 먼저 AI 리뷰 [생성] 버튼을 눌러 리뷰 본문을 준비해주세요.', 'error');
      return;
    }

    setIsAutoRegistering(true);
    cancelAutoRegRef.current = false;
    setAutoRegState({
      current: 1,
      total: 1,
      productName: getStr(row.productName),
      accountHolder: getStr(row.accountHolder) || '자동감지',
      stepText: '쿠팡 마이페이지 탭 연결 중...',
      activeRowId: row.id,
    });

    const result = await executeSingleAutoReview(row);

    setIsAutoRegistering(false);
    setAutoRegState((prev) => ({ ...prev, activeRowId: '', stepText: '' }));

    if (result.success) {
      await handleCheckChange(row.id, 'isReviewWritten', true);
      showToast(
        `✅ [${getStr(row.productName).slice(0, 18)}] 자동 등록 및 인증 캡처 저장 완료!`,
        'success'
      );
    } else if (result.skipped) {
      showToast(`ℹ️ ${result.error}`, 'info');
    } else if (result.error) {
      alert(`❌ 자동 등록 실패\n\n사유: ${result.error}`);
    }
  };

  // 🚀 다건 [선택 항목 일괄 자동등록] 핸들러 (3초 간격 순차 큐 처리)
  const handleBulkAutoRegister = async (e: React.MouseEvent) => {
    e.preventDefault();

    const installed =
      isExtInstalled ||
      document.documentElement.getAttribute('data-coupang-ext-installed') === 'true';
    if (!installed) {
      setShowExtGuideModal(true);
      return;
    }

    const selectedList = localData.filter((r) => selectedRows.has(r.id));
    if (selectedList.length === 0) {
      showToast('⚠️ 먼저 우측 체크박스에서 자동 등록할 항목을 선택해주세요.', 'info');
      return;
    }

    // 1. 이미 리뷰오토 페이지에서 [작성] 체크된 상품 제외
    const unwrittenList = selectedList.filter((r) => !r.isReviewWritten);
    const alreadyWrittenCount = selectedList.length - unwrittenList.length;

    if (unwrittenList.length === 0) {
      showToast('ℹ️ 선택하신 항목은 모두 이미 [작성] 체크가 되어 있어 건너뜁니다.', 'info');
      return;
    }

    // 2. 현재 연결된 계정주(예: 김수연)가 지정되어 있으면, 다른 계정주(이시온, 이현숙 등) 행은 쿠팡 탐색조차 하지 않고 즉시 제외!
    const targetList = assignedExtAccount
      ? unwrittenList.filter((r) => {
          const holder = getStr(r.accountHolder).trim();
          return !holder || isAccountHolderMatch(holder, assignedExtAccount);
        })
      : unwrittenList;
    const otherAccountCount = unwrittenList.length - targetList.length;

    if (targetList.length === 0) {
      showToast(
        `ℹ️ 선택하신 항목 중 현재 연결된 계정주(${assignedExtAccount})의 미작성 상품이 없어 건너뜁니다.`,
        'info'
      );
      return;
    }

    const excludeNotices: string[] = [];
    if (alreadyWrittenCount > 0) {
      excludeNotices.push(`- 이미 [작성] 체크된 ${alreadyWrittenCount}건은 검수 없이 자동 제외됩니다.`);
    }
    if (otherAccountCount > 0) {
      excludeNotices.push(
        `- 현재 연결된 계정주(${assignedExtAccount}) 외 다른 계정주 ${otherAccountCount}건은 자동 스킵됩니다.`
      );
    }
    const excludeNoticeStr = excludeNotices.length > 0 ? `\n${excludeNotices.join('\n')}` : '';

    if (
      !confirm(
        `선택하신 항목 중 대상 [${targetList.length}건]에 대해 쿠팡 리뷰 자동 등록 및 인증 캡처를 시작할까요?${excludeNoticeStr}\n- 포토 리뷰는 자동으로 건너뜁니다.\n- 별점 타입은 별점 5점 + 객관식 설문만 등록합니다.\n- 항목 간 3초 간격으로 순차 진행됩니다.`
      )
    ) {
      return;
    }

    setIsAutoRegistering(true);
    cancelAutoRegRef.current = false;

    let successCount = 0;
    const skippedItems: string[] = [];
    const failedItems: string[] = [];
    let activeCoupangAccount = assignedExtAccount;

    for (let i = 0; i < targetList.length; i++) {
      if (cancelAutoRegRef.current) break;

      const row = targetList[i];
      const title = getStr(row.productName).trim() || '(상품명 없음)';
      const rowHolder = getStr(row.accountHolder).trim();

      // [자동감지 모드 대응] 첫 상품에서 쿠팡 로그인 계정(예: 김*연)이 감지된 이후에는 다른 계정주 행을 0초 만에 즉시 스킵!
      if (
        activeCoupangAccount &&
        rowHolder &&
        !isAccountHolderMatch(rowHolder, activeCoupangAccount)
      ) {
        skippedItems.push(
          `• ${title.slice(0, 20)} (${rowHolder}): 연결된 계정(${activeCoupangAccount}) 아님 → 스킵`
        );
        continue;
      }

      setAutoRegState({
        current: i + 1,
        total: targetList.length,
        productName: title,
        accountHolder: rowHolder || '자동감지',
        stepText: '쿠팡 탭에서 상품 탐색 및 작성 준비 중...',
        activeRowId: row.id,
      });

      const res = await executeSingleAutoReview(row);

      if (res.detectedAccountName && !activeCoupangAccount) {
        activeCoupangAccount = res.detectedAccountName;
      }

      if (res.success) {
        successCount++;
        await handleCheckChange(row.id, 'isReviewWritten', true);
      } else if (res.skipped) {
        skippedItems.push(`• ${title.slice(0, 22)}: ${res.error}`);
      } else {
        failedItems.push(`• ${title.slice(0, 22)}: ${res.error || '실패'}`);
      }

      // 다음 항목이 남아있고 취소되지 않았으면 대기 (스킵된 항목은 즉시 다음 상품 진행)
      if (i < targetList.length - 1 && !cancelAutoRegRef.current) {
        const waitMs = res.skipped ? 600 : 3000;
        setAutoRegState((prev) => ({
          ...prev,
          stepText: res.skipped
            ? '건너뜀 — 바로 다음 상품으로 이동 중...'
            : '다음 항목 실행 전 3초 대기 중...',
        }));
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    setIsAutoRegistering(false);
    setAutoRegState({
      current: 0,
      total: 0,
      productName: '',
      accountHolder: '',
      stepText: '',
      activeRowId: '',
    });

    const summaryLines = [`✅ 성공: ${successCount}건`];
    if (skippedItems.length > 0) {
      summaryLines.push(`\n⏭️ 건너뜀 (${skippedItems.length}건):\n${skippedItems.join('\n')}`);
    }
    if (failedItems.length > 0) {
      summaryLines.push(`\n❌ 실패 (${failedItems.length}건):\n${failedItems.join('\n')}`);
    }

    alert(`🚀 일괄 자동 등록 완료!\n\n${summaryLines.join('\n')}`);
  };

  const handleCancelAutoRegister = () => {
    cancelAutoRegRef.current = true;
    window.postMessage({ type: 'CP_EXT_CANCEL_REVIEW' }, '*');
    if (pendingExtResolverRef.current) {
      const resolve = pendingExtResolverRef.current;
      pendingExtResolverRef.current = null;
      resolve({ success: false, skipped: true, error: '사용자에 의해 취소됨' });
    }
    setIsAutoRegistering(false);
  };

  const handleSave = async (e: React.MouseEvent, row: any) => {
    e.preventDefault();
    if (getStr(row.id).startsWith('temp-'))
      return alert('서버에 생성 중입니다. 잠시 후 시도해주세요.');
    const prev = [...localData];
    setEditingRows((p) => {
      const n = new Set(p);
      n.delete(row.id);
      return n;
    });
    try {
      const { memo: _memo, ...safeData } = row;
      safeData.price = parseInt(safeData.price) || 0;
      await updatePurchase(row.id, safeData);

      setLocalData((curr) =>
        curr.map((r) => (r.id === row.id ? { ...r, price: safeData.price } : r))
      );
      showToast('💾 저장되었습니다.', 'success');
    } catch {
      setLocalData(prev);
      alert('수정 실패');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm('정말 삭제하시겠습니까?')) return;
    setLocalData((prev) => prev.filter((item) => item.id !== id));
    try {
      await deletePurchase(id);
    } catch {
      fetchData();
    }
  };

  const handleBulkDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedRows.size === 0 || !confirm(`${selectedRows.size}개 삭제하시겠습니까?`))
      return;
    const ids = Array.from(selectedRows);
    setLocalData((prev) => prev.filter((item) => !ids.includes(item.id)));
    setSelectedRows(new Set());
    try {
      await deletePurchases(ids);
    } catch {
      fetchData();
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const rowToDuplicate = localData.find((r) => r.id === id);
    if (!rowToDuplicate) return;
    const tempId = `temp-${Date.now()}`;
    setLocalData((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const newData = [...prev];
      newData.splice(index, 0, { ...rowToDuplicate, id: tempId });
      return newData;
    });
    try {
      const newSaved = await duplicatePurchase(id);
      setLocalData((prev) => prev.map((item) => (item.id === tempId ? newSaved : item)));
    } catch {
      fetchData();
    }
  };

  const handleAddRow = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (isAdding || isAutoRegistering) return;

    const repeatCount = Math.min(30, Math.max(1, parseInt(addCountInput, 10) || 1));
    setAddCountInput(String(repeatCount));

    setIsAdding(true);
    setHideSpinner(true);
    try {
      const addedRows = await addPurchase(repeatCount);

      if (addedRows && Array.isArray(addedRows)) {
        setEditingRows((prev) => {
          const next = new Set(prev);
          addedRows.forEach((row: any) => next.add(row.id));
          return next;
        });
      }

      if (activeTab === 'progress' && currentPage === 1) {
        await fetchData();
      } else {
        setActiveTab('progress');
        setCurrentPage(1);
      }
    } catch {
      alert('추가 실패');
      setHideSpinner(false);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      {/* 상단 탭 */}
      <div className="flex border-b bg-gray-100">
        <button
          type="button"
          onClick={(e) => changeTab(e, 'progress')}
          className={`flex-1 py-3 font-bold text-sm transition-colors ${
            activeTab === 'progress'
              ? 'bg-white text-purple-700 border-t-2 border-t-purple-600'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          🔥 진행 중 내역
        </button>
        <button
          type="button"
          onClick={(e) => changeTab(e, 'completed')}
          className={`flex-1 py-3 font-bold text-sm transition-colors ${
            activeTab === 'completed'
              ? 'bg-white text-green-700 border-t-2 border-t-green-600'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          ✅ 완료 내역
        </button>
      </div>

      {/* 검색 및 액션 바 */}
      <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4 justify-between items-center bg-gray-50">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={searchField}
            onChange={(e) => {
              const nextField = e.target.value;
              setSearchField(nextField);
              if (searchInput.trim() !== '' || appliedSearch.trim() !== '') {
                setCurrentPage(1);
                setAppliedField(nextField);
                setAppliedSearch(searchInput);
                setSearchTrigger((prev) => prev + 1);
              }
            }}
            className="p-2 border rounded-lg outline-none text-sm bg-white"
          >
            <option value="productName">상품명</option>
            <option value="purchaseDate">구매일</option>
            <option value="accountHolder">계정주</option>
            <option value="platform">플랫폼</option>
            <option value="chatRoomName">카톡방명</option>
            <option value="paybackName">페이백명</option>
            <option value="contactOnBangpok">기타메모</option>
            <option value="price">가격</option>
          </select>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
            placeholder="검색어 입력 후 엔터"
            className="p-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm w-[200px] bg-white"
          />
          <button
            type="button"
            onClick={executeSearch}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-700"
          >
            검색
          </button>
          {(appliedSearch !== '' || searchInput !== '') && (
            <button
              type="button"
              onClick={resetSearch}
              className="bg-white text-gray-600 border border-gray-300 px-2.5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-100"
              title="검색 초기화 (전체 목록 보기)"
            >
              초기화
            </button>
          )}

          {/* 크롬 확장프로그램 연결 상태 배지 */}
          <button
            type="button"
            onClick={() => setShowExtGuideModal(true)}
            className={`ml-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
              isExtInstalled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
            }`}
            title="클릭하여 크롬 확장 프로그램 설치 및 사용법 보기"
          >
            <span>{isExtInstalled ? '🟢' : '⚪'}</span>
            <span>
              {isExtInstalled
                ? `자동등록 연결됨${assignedExtAccount ? ` (${assignedExtAccount})` : ''}`
                : '자동등록 확장프로그램 안내'}
            </span>
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleBulkGenerateAi}
            disabled={isLoading || isBulkGenerating || isAdding || isAutoRegistering}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            ✨ 전체 AI 생성
          </button>
          <button
            type="button"
            onClick={handleBulkAutoRegister}
            disabled={selectedRows.size === 0 || isAutoRegistering || isBulkGenerating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            🚀 선택 자동등록 ({selectedRows.size})
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={selectedRows.size === 0 || isAutoRegistering}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            🗑️ 선택 삭제
          </button>
          <div className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={handleAddRow}
              disabled={isAdding || isAutoRegistering}
              className="pl-3 pr-1.5 py-2 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              새 항목
            </button>
            <input
              type="number"
              min={1}
              max={30}
              value={addCountInput}
              onChange={(e) => setAddCountInput(e.target.value)}
              onBlur={() => {
                const parsed = Math.min(30, Math.max(1, parseInt(addCountInput, 10) || 1));
                setAddCountInput(String(parsed));
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddRow(e);
                }
              }}
              disabled={isAdding || isAutoRegistering}
              className="w-12 py-1 px-1 text-center text-gray-900 bg-white rounded font-bold text-sm outline-none focus:ring-2 focus:ring-green-300"
              title="추가할 횟수 입력 (1회당 등록된 계정 수만큼 행 추가)"
            />
            <button
              type="button"
              onClick={handleAddRow}
              disabled={isAdding || isAutoRegistering}
              className="pl-1.5 pr-3 py-2 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {isAdding
                ? '⏳ 추가 중...'
                : `번 추가${
                    safeAccounts.length > 0
                      ? ` (${Math.max(1, parseInt(addCountInput, 10) || 1) * safeAccounts.length}줄)`
                      : ''
                  }`}
            </button>
          </div>
        </div>
      </div>

      {/* 메인 시트 테이블 */}
      <div className="overflow-x-auto min-h-[400px] relative">
        {isLoading && !hideSpinner && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-purple-500 border-t-transparent"></div>
          </div>
        )}
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs sticky top-0 z-0">
            <tr>
              <th className="px-2 py-3 border-r text-center w-[90px]">구매일</th>
              <th className="px-2 py-3 border-r w-[90px] text-center">계정주</th>
              <th className="px-2 py-3 border-r w-[80px] text-center">플랫폼</th>
              <th className="px-2 py-3 border-r w-[140px] text-center">상품명</th>
              <th className="px-2 py-3 border-r w-[130px] text-center">카톡방명</th>
              <th className="px-2 py-3 border-r w-[100px] text-center">페이백명</th>
              <th className="px-2 py-3 border-r w-[120px] text-center">기타 메모</th>
              <th className="px-2 py-3 border-r w-[80px] text-center">가격</th>
              <th className="px-2 py-3 border-r w-[100px] text-center">리뷰 타입</th>
              <th className="px-2 py-3 border-r w-[80px] text-center">AI 리뷰</th>
              <th className="px-1 py-3 border-r text-center w-[40px]">작성</th>
              <th className="px-1 py-3 border-r text-center w-[40px]">상페</th>
              <th className="px-1 py-3 border-r text-center w-[40px]">리페</th>
              <th className="px-2 py-3 border-r text-center w-[180px]">작업</th>
              <th className="px-2 py-3 text-center w-[40px]">
                <input
                  type="checkbox"
                  onChange={toggleAllSelection}
                  checked={localData.length > 0 && selectedRows.size === localData.length}
                  className="w-4 h-4 rounded cursor-pointer accent-red-500"
                />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {localData.length === 0 && !isLoading ? (
              <tr>
                <td
                  colSpan={15}
                  className="px-4 py-16 text-center text-gray-500 font-medium bg-gray-50/50"
                >
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              localData.map((row) => {
                const isEditing = editingRows.has(row.id);
                const isSelected = selectedRows.has(row.id);
                const isWritten = row.isReviewWritten || false;
                const isProductPayback = row.isProductPayback || false;
                const isReviewPayback = row.isReviewPayback || false;
                const writtenBg = isWritten ? 'bg-blue-100' : '';
                const productBg = isProductPayback
                  ? 'bg-blue-100'
                  : isWritten
                  ? 'bg-red-100'
                  : '';
                const reviewBg = isReviewPayback
                  ? 'bg-blue-100'
                  : isWritten
                  ? 'bg-red-100'
                  : '';
                const rowBg = isSelected
                  ? 'bg-red-50/40'
                  : isEditing
                  ? 'bg-yellow-50/30'
                  : 'hover:bg-blue-50/20';

                const isPhotoType =
                  getStr(row.reviewType).includes('포토') ||
                  getStr(row.reviewType).includes('사진');

                return (
                  <tr key={row.id} className={`${rowBg} transition-colors`}>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <input
                          type="date"
                          value={getStr(row.purchaseDate)}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'purchaseDate', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs"
                        />
                      ) : (
                        <div className="py-2 px-1 text-xs">{getStr(row.purchaseDate)}</div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select
                          value={getStr(row.accountHolder)}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'accountHolder', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white"
                        >
                          <option value="">선택 안됨</option>
                          {safeAccounts.map((acc, idx) => (
                            <option key={`acc-${idx}`} value={getStr(acc?.accountHolder)}>
                              {getStr(acc?.accountHolder) || '이름 없음'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="py-2 px-1 truncate max-w-[90px] mx-auto text-xs">
                          {getStr(row.accountHolder) || '-'}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <input
                          type="text"
                          value={getStr(row.platform)}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'platform', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs"
                        />
                      ) : (
                        <div className="py-2 px-1 truncate max-w-[80px] mx-auto text-xs">
                          {getStr(row.platform) || '-'}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <input
                          type="text"
                          value={getStr(row.productName)}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'productName', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                        />
                      ) : (
                        <div
                          className="py-2 px-1 truncate max-w-[140px] mx-auto text-xs"
                          title={getStr(row.productName)}
                        >
                          {getStr(row.productName) || '-'}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <input
                          type="text"
                          value={getStr(row.chatRoomName)}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'chatRoomName', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                        />
                      ) : (
                        <div
                          className="py-2 px-1 truncate max-w-[130px] mx-auto text-xs"
                          title={getStr(row.chatRoomName)}
                        >
                          {getStr(row.chatRoomName) || '-'}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <input
                          type="text"
                          value={getStr(row.paybackName)}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'paybackName', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs"
                        />
                      ) : (
                        <div
                          className="py-2 px-1 truncate max-w-[100px] mx-auto text-xs"
                          title={getStr(row.paybackName)}
                        >
                          {getStr(row.paybackName) || '-'}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <input
                          type="text"
                          value={getStr(row.contactOnBangpok)}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'contactOnBangpok', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs"
                        />
                      ) : (
                        <div
                          className="py-2 px-1 truncate max-w-[120px] mx-auto text-xs"
                          title={getStr(row.contactOnBangpok)}
                        >
                          {getStr(row.contactOnBangpok) || '-'}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-right">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.price === 0 ? '' : row.price || ''}
                          onChange={(e) =>
                            handleLocalChange(
                              row.id,
                              'price',
                              e.target.value.replace(/[^0-9]/g, '')
                            )
                          }
                          placeholder="가격"
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-right text-xs"
                        />
                      ) : (
                        <div className="py-2 px-1 text-xs">
                          {row.price ? Number(row.price).toLocaleString() : ''}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center">
                      {isEditing ? (
                        <select
                          value={getStr(row.reviewType) || '(빈)별점'}
                          onChange={(e) =>
                            handleLocalChange(row.id, 'reviewType', e.target.value)
                          }
                          className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 text-center text-xs bg-white"
                        >
                          <option value="(빈)별점">(빈)별점</option>
                          <option value="(빈)텍스트">(빈)텍스트</option>
                          <option value="(빈)한줄텍">(빈)한줄텍</option>
                          <option value="(빈)포토">(빈)포토</option>
                          <option value="(빈)원고제공">(빈)원고제공</option>
                          <option value="실배">실배</option>
                        </select>
                      ) : (
                        <div className="py-2 px-1 text-xs text-center">
                          {getStr(row.reviewType) || '-'}
                        </div>
                      )}
                    </td>
                    <td className="p-1 border-r text-center align-middle">
                      <div className="flex flex-col gap-1.5 px-1">
                        {row.reviewType === '(빈)텍스트' ||
                        row.reviewType === '(빈)원고제공' ||
                        getStr(row.reviewType).includes('한줄') ? (
                          !row.generatedReview ? (
                            <button
                              type="button"
                              onClick={(e) =>
                                handleGenerateAi(e, row.id, row.productName)
                              }
                              className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full"
                            >
                              생성
                            </button>
                          ) : (() => {
                            const rawRev = getStr(row.generatedReview);
                            const isIncomplete =
                              row.reviewType !== '(빈)원고제공' &&
                              !isValidThreeStyleReview(rawRev);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setModalReview({
                                    id: row.id,
                                    productName: getStr(row.productName),
                                    originalText: rawRev,
                                    currentText: rawRev,
                                    selectedStyle: 'all',
                                  });
                                }}
                                title={
                                  isIncomplete
                                    ? '일부 스타일이 잘렸거나 3개 미만입니다. 클릭 후 [AI 다시 생성]을 눌러 복구할 수 있습니다.'
                                    : '생성된 AI 리뷰 확인 및 수정'
                                }
                                className={`${
                                  isIncomplete
                                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'
                                    : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                                } text-[11px] py-1.5 px-1 rounded font-medium transition-colors w-full`}
                              >
                                {isIncomplete ? '⚠️ 보기(잘림)' : '📄 보기'}
                              </button>
                            );
                          })()
                        ) : (
                          <span className="text-gray-400 text-[11px] block text-center py-1.5">
                            -
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={`p-1 border-r text-center transition-colors duration-300 ${writtenBg}`}
                    >
                      <input
                        type="checkbox"
                        checked={isWritten}
                        onChange={(e) =>
                          handleCheckChange(row.id, 'isReviewWritten', e.target.checked)
                        }
                        className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td
                      className={`p-1 border-r text-center transition-colors duration-300 ${productBg}`}
                    >
                      <input
                        type="checkbox"
                        checked={isProductPayback}
                        onChange={(e) =>
                          handleCheckChange(row.id, 'isProductPayback', e.target.checked)
                        }
                        className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td
                      className={`p-1 border-r text-center transition-colors duration-300 ${reviewBg}`}
                    >
                      <input
                        type="checkbox"
                        checked={isReviewPayback}
                        onChange={(e) =>
                          handleCheckChange(row.id, 'isReviewPayback', e.target.checked)
                        }
                        className="w-5 h-5 rounded mt-1 accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-1 py-3 border-r text-center">
                      <div className="flex gap-1 justify-center items-center">
                        {/* 🚀 쿠팡 자동등록 단건 실행 버튼 */}
                        <button
                          type="button"
                          onClick={(e) => handleAutoRegisterSingle(e, row)}
                          disabled={isAutoRegistering || isPhotoType}
                          title={
                            isPhotoType
                              ? '포토 리뷰는 수동 등록 대상입니다'
                              : '쿠팡 마이페이지에서 리뷰 자동 작성 및 인증 캡처 저장'
                          }
                          className={`px-2 py-1 rounded font-bold text-xs transition-colors border ${
                            isPhotoType
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : isWritten
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          }`}
                        >
                          {autoRegState.activeRowId === row.id
                            ? '⏳진행중'
                            : isPhotoType
                            ? '포토제외'
                            : '🚀자동등록'}
                        </button>

                        {isEditing ? (
                          <button
                            type="button"
                            onClick={(e) => handleSave(e, row)}
                            className="px-2 py-1 bg-green-500 text-white rounded font-medium hover:bg-green-600 text-xs transition-colors"
                          >
                            저장
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleEdit(e, row.id)}
                            className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium hover:bg-blue-100 text-xs transition-colors"
                          >
                            수정
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDuplicate(e, row.id)}
                          className="px-2 py-1 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded font-medium hover:bg-yellow-100 text-xs transition-colors"
                        >
                          복제
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, row.id)}
                          className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded font-medium hover:bg-red-100 text-xs transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center align-middle bg-gray-50 border-l border-gray-200">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(row.id)}
                        className="w-5 h-5 cursor-pointer accent-red-500"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex justify-center items-center py-4 bg-white border-t gap-2">
        <button
          type="button"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold"
        >
          이전
        </button>
        <span className="text-sm font-bold text-gray-600 px-4">
          {currentPage} / {totalPages} 페이지
        </span>
        <button
          type="button"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30 font-bold"
        >
          다음
        </button>
      </div>

      {/* 쿠팡 파트너스 배너 및 필수 고지 문구 */}
      <div className="py-8 bg-gray-50 flex flex-col items-center justify-center border-t border-gray-200 px-4 rounded-b-xl">
        <CoupangBanner />
        <p className="mt-4 text-[11px] text-gray-400 tracking-tight text-center font-medium">
          &ldquo;이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를
          제공받습니다.&rdquo;
        </p>
      </div>

      {/* 📄 AI 리뷰 확인 및 스타일 선택 모달 */}
      {modalReview && (() => {
        const candidates = splitReviewCandidates(modalReview.originalText);
        const hasMultiple = candidates.length > 1;
        const isCurrentIncomplete = !isValidThreeStyleReview(modalReview.originalText);
        const modalRow = localData.find((r) => r.id === modalReview.id);
        const targetProductName = getStr(
          modalReview.productName || modalRow?.productName
        ).trim();

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-3 border-b pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl">📄</span>
                  <h3 className="text-lg font-bold text-gray-800">AI 리뷰 확인 및 선택</h3>
                  {hasMultiple && (
                    <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                      총 {candidates.length}개 스타일
                    </span>
                  )}
                  {isCurrentIncomplete && modalRow?.reviewType !== '(빈)원고제공' && (
                    <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2 py-0.5 rounded-full font-bold">
                      ⚠️ 문장 잘림/미완성 감지
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {targetProductName && (
                    <button
                      type="button"
                      disabled={isRegeneratingInModal}
                      onClick={async () => {
                        if (!hasApiKey) {
                          alert(
                            'api키가 입력 되지않았습니다. gemini api 키 설정 화면을 참고해 api 키를 입력해주세요'
                          );
                          return;
                        }
                        setIsRegeneratingInModal(true);
                        try {
                          const generatedText = await generateAiReview(
                            modalReview.id,
                            targetProductName
                          );
                          const sameProductRows = localData.filter(
                            (r) =>
                              !r.isReviewWritten &&
                              (r.reviewType === '(빈)텍스트' ||
                                getStr(r.reviewType).includes('한줄')) &&
                              getStr(r.productName).trim() === targetProductName
                          );
                          for (const r of sameProductRows) {
                            if (r.id !== modalReview.id) {
                              await updatePurchase(r.id, {
                                generatedReview: generatedText,
                              });
                            }
                          }
                          const updatedIds = new Set([
                            modalReview.id,
                            ...sameProductRows.map((r) => r.id),
                          ]);
                          setLocalData((prev) =>
                            prev.map((r) =>
                              updatedIds.has(r.id)
                                ? { ...r, generatedReview: generatedText }
                                : r
                            )
                          );
                          setModalReview({
                            ...modalReview,
                            originalText: generatedText,
                            currentText: generatedText,
                            selectedStyle: 'all',
                          });
                          showToast(
                            '✨ 3가지 스타일 AI 리뷰가 완전한 문장으로 다시 생성되었습니다!',
                            'success'
                          );
                        } catch (err: any) {
                          alert(
                            `AI 다시 생성에 실패했습니다.\n사유: ${err?.message || '오류 발생'}`
                          );
                        } finally {
                          setIsRegeneratingInModal(false);
                        }
                      }}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isRegeneratingInModal ? '⏳' : '🔄'}</span>
                      <span>
                        {isRegeneratingInModal ? '다시 생성 중...' : 'AI 다시 생성'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalReview(null)}
                    className="text-gray-400 hover:text-gray-600 font-bold text-xl leading-none p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* 3가지 스타일이 있을 때 전환 탭 및 빠른 개별 복사 바 */}
              {hasMultiple && (
                <div className="mb-3 p-3 bg-purple-50/70 border border-purple-100 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-xs font-bold text-purple-900 flex items-center gap-1">
                      <span>💡</span> 스타일 전환 (선택해도 원본은 보존됩니다):
                    </span>
                    {modalReview.selectedStyle !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalReview({
                            ...modalReview,
                            currentText: modalReview.originalText,
                            selectedStyle: 'all',
                          });
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
                      >
                        ↩ 전체 원본으로 되돌리기
                      </button>
                    )}
                  </div>

                  {/* 스타일 탭 */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setModalReview({
                          ...modalReview,
                          currentText: modalReview.originalText,
                          selectedStyle: 'all',
                        });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        modalReview.selectedStyle === 'all'
                          ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-300'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      📑 전체 원본 보기
                    </button>

                    {candidates.map((cand, idx) => {
                      const isSelected = modalReview.selectedStyle === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setModalReview({
                              ...modalReview,
                              currentText: cand,
                              selectedStyle: idx,
                            });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                            isSelected
                              ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-300'
                              : 'bg-white text-purple-700 hover:bg-purple-100 border border-purple-200'
                          }`}
                        >
                          <span>{idx + 1}번 스타일만 보기</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 원클릭 빠른 복사 버튼 바 */}
                  <div className="pt-2 border-t border-purple-100/80 flex items-center flex-wrap gap-1.5">
                    <span className="text-[11px] font-semibold text-gray-600 mr-1">
                      ⚡ 1초 복사:
                    </span>
                    {candidates.map((cand, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          await navigator.clipboard.writeText(cand);
                          showToast(`📋 ${idx + 1}번 스타일 리뷰가 클립보드에 복사되었습니다!`, 'success');
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded text-xs font-medium transition-colors shadow-2xs"
                      >
                        📋 {idx + 1}번 복사
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 편집 영역 레이블 */}
              <div className="flex justify-between items-center mb-1 text-xs text-gray-500">
                <span>
                  {modalReview.selectedStyle === 'all'
                    ? '📝 전체 원본 리뷰 (아래에서 자유롭게 수정 가능)'
                    : `✨ ${Number(modalReview.selectedStyle) + 1}번 스타일 내용`}
                </span>
                <span className="text-[11px] text-gray-400">
                  {modalReview.currentText.length}자
                </span>
              </div>

              <textarea
                value={modalReview.currentText}
                onChange={(e) => {
                  setModalReview({ ...modalReview, currentText: e.target.value });
                }}
                className="w-full h-48 p-4 border border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500 bg-white rounded-lg text-sm resize-none outline-none leading-relaxed"
                placeholder="리뷰 텍스트를 입력하거나 수정할 수 있습니다."
              />

              <div className="mt-5 flex justify-between items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={async () => {
                    const textToSave = modalReview.currentText;
                    setLocalData((prev) =>
                      prev.map((r) =>
                        r.id === modalReview.id ? { ...r, generatedReview: textToSave } : r
                      )
                    );
                    await updatePurchase(modalReview.id, {
                      generatedReview: textToSave,
                    });
                    setModalReview({
                      ...modalReview,
                      originalText: textToSave,
                    });
                    showToast('💾 리뷰 본문이 성공적으로 저장되었습니다!', 'success');
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <span>💾</span>
                  <span>
                    {modalReview.selectedStyle === 'all'
                      ? '수정내용 저장'
                      : `${Number(modalReview.selectedStyle) + 1}번 스타일로 확정 저장`}
                  </span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleCopy(e, modalReview.currentText)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors"
                  >
                    📋 현재 내용 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalReview(null)}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✨ 전체 AI 리뷰 생성 진행 모달 */}
      {isBulkGenerating && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              AI 리뷰 전체 생성 중...
            </h3>
            <p className="text-gray-500 text-sm mb-6 text-center">
              API 최적화를 위해 고유 상품명 단위로 생성됩니다.
              <br />
              <span className="font-bold text-purple-600 mt-2 block text-lg">
                ({bulkProgress.current} / {bulkProgress.total})
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                cancelBulkRef.current = true;
              }}
              className="px-6 py-2 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-lg transition-colors w-full"
            >
              생성 취소
            </button>
          </div>
        </div>
      )}

      {/* 🚀 쿠팡 자동 리뷰 작성 & 캡처 진행 모달 */}
      {isAutoRegistering && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 flex flex-col items-center max-w-md w-full mx-4">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-extrabold text-gray-900 mb-1">
              🚀 쿠팡 자동 리뷰 & 캡처 진행 중
            </h3>
            <p className="text-xs font-bold text-indigo-600 mb-4">
              진행 현황: {autoRegState.current} / {autoRegState.total} 건
            </p>
            <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 text-left space-y-1.5">
              <div className="text-xs text-gray-500">
                담당 계정주:{' '}
                <span className="font-bold text-gray-800">
                  {autoRegState.accountHolder}
                </span>
              </div>
              <div className="text-xs text-gray-500 truncate">
                대상 상품:{' '}
                <span className="font-bold text-gray-800">
                  {autoRegState.productName}
                </span>
              </div>
              <div className="text-xs text-indigo-700 font-bold pt-1">
                📡 {autoRegState.stepText || '쿠팡 탭과 통신 중...'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelAutoRegister}
              className="px-6 py-2.5 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-xl transition-colors w-full text-sm"
            >
              자동 등록 중단하기
            </button>
          </div>
        </div>
      )}

      {/* 안내 모달: 크롬 확장 프로그램 설치 가이드 */}
      {showExtGuideModal && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full m-4 p-6">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-lg font-extrabold text-gray-900">
                🚀 쿠팡 자동 리뷰 & 캡처 확장프로그램 안내
              </h3>
              <button
                type="button"
                onClick={() => setShowExtGuideModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
              <p className="font-semibold text-indigo-700 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                현재 상태:{' '}
                {isExtInstalled
                  ? `✅ 설치 및 연결 완료 ${
                      assignedExtAccount ? `(담당 계정주: ${assignedExtAccount})` : '(자동 감지 모드)'
                    }`
                  : '⚪ 미설치 (아래 순서대로 10초 만에 등록하세요)'}
              </p>
              <ol className="list-decimal list-inside space-y-2 font-medium text-gray-800 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <li>
                  크롬 주소창에 <code className="bg-gray-200 px-1.5 py-0.5 rounded font-bold">chrome://extensions</code> 를 입력해 이동합니다.
                </li>
                <li>
                  우측 상단의 <b>[개발자 모드]</b> 스위치를 켭니다 (ON).
                </li>
                <li>
                  좌측 상단의 <b>[압축해제된 확장 프로그램을 로드합니다]</b> 버튼을 클릭합니다.
                </li>
                <li>
                  이 프로젝트 폴더 안의 <code className="bg-gray-200 px-1.5 py-0.5 rounded font-bold">extension</code> 폴더를 선택하면 즉시 연결됩니다!
                </li>
              </ol>
              <div className="text-xs text-gray-500 space-y-1 pt-1">
                <p>• 각 구글 프로필 크롬 창마다 확장프로그램 팝업에서 담당 계정주(김수연, 이시온 등)를 지정해 둘 수 있습니다.</p>
                <p>• 리뷰 등록 완료 시 <b>작성한 리뷰(li.my-review__wrote__list)</b> 영역만 크롭하여 PC 다운로드 폴더 내 <b>쿠팡리뷰인증/[계정주] 상품명.png</b>로 자동 저장합니다.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExtGuideModal(false)}
                className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl text-sm"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 우측 하단 토스트 알림 */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-[70] px-5 py-3.5 rounded-xl shadow-xl font-bold text-sm text-white transition-all ${
            toastMsg.type === 'error'
              ? 'bg-red-600'
              : toastMsg.type === 'success'
              ? 'bg-emerald-600'
              : 'bg-gray-900'
          }`}
        >
          {toastMsg.text}
        </div>
      )}
    </div>
  );
}
