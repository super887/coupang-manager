// 쿠팡매니저 크롬 확장 프로그램 Service Worker (background.js)

const COUPANG_REVIEW_WAIT_URL = 'https://my.coupang.com/productreview/reviewable';
let watchdogTimer = null;

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function startWatchdog() {
  stopWatchdog();
  watchdogTimer = setInterval(async () => {
    try {
      const { activeReviewTask: task } = await chrome.storage.local.get('activeReviewTask');
      if (!task || !task.coupangTabId) {
        stopWatchdog();
        return;
      }

      const lastActive = task.lastActivityAt || task.startedAt || Date.now();
      const idleMs = Date.now() - lastActive;

      // 15초 동안 아무 진행 응답이 없으면(쿠팡 네트워크 먹통/흰화면 멈춤) 백그라운드에서 강제 F5(새로고침)
      if (idleMs > 15000) {
        const bgReloadCount = (task.bgReloadCount || 0) + 1;
        if (bgReloadCount <= 3) {
          const updated = {
            ...task,
            bgReloadCount,
            lastActivityAt: Date.now(),
            startedAt: Date.now(),
          };
          await chrome.storage.local.set({ activeReviewTask: updated });

          if (task.webTabId) {
            await notifyWebTab(task.webTabId, 'REVIEW_TASK_PROGRESS', {
              requestId: task.requestId,
              purchaseId: task.purchaseId,
              stepText: `⚡ 쿠팡 응답 지연(흰 화면) 감지 → 자동 새로고침(F5) 중... (${bgReloadCount}/3)`,
            });
          }

          await chrome.tabs.reload(task.coupangTabId);
        } else {
          stopWatchdog();
        }
      }
    } catch {
      // ignore
    }
  }, 4000);
}

function sanitizeFilePart(str, maxLen = 85) {
  if (!str) return '';
  return String(str)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, maxLen)
    .trim();
}

async function notifyWebTab(webTabId, type, payload) {
  if (!webTabId) return;
  try {
    await chrome.tabs.sendMessage(webTabId, { type, payload });
  } catch (err) {
    console.warn('웹 탭 메시지 전송 실패:', err);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  // 1. 웹 페이지 상태 확인 및 계정주 목록 동기화
  if (message.type === 'GET_EXT_STATUS') {
    (async () => {
      const data = await chrome.storage.local.get(['assignedAccount', 'knownAccounts']);
      if (Array.isArray(message.knownAccounts) && message.knownAccounts.length > 0) {
        await chrome.storage.local.set({ knownAccounts: message.knownAccounts });
      }
      sendResponse({
        installed: true,
        assignedAccount: data.assignedAccount || '',
      });
    })();
    return true;
  }

  // 2. 자동 리뷰 작성 작업 시작 (주문목록 검색 진입 방식)
  if (message.type === 'START_REVIEW_TASK') {
    (async () => {
      const payload = message.payload || {};
      const webTabId = sender.tab?.id;
      const webWindowId = sender.tab?.windowId;

      const settings = await chrome.storage.local.get(['assignedAccount']);
      const assignedAccount = (settings.assignedAccount || '').trim();
      const targetAccount = (payload.accountHolder || '').trim();
      const reviewType = (payload.reviewType || '').trim();

      // [규칙 1] 팝업에 고정된 담당 계정주와 요청 계정주 비교 -> 다르면 에러가 아니라 즉시 스킵(skipped) 처리!
      if (assignedAccount && targetAccount && assignedAccount !== targetAccount) {
        sendResponse({
          immediateSkip: true,
          detectedAccountName: assignedAccount,
          immediateError: `현재 연결된 계정(${assignedAccount})이 아닌 [${targetAccount}] 행이므로 건너뜁니다.`,
        });
        return;
      }

      // [규칙 2] 포토 리뷰 스킵
      if (reviewType.includes('포토') || reviewType.includes('사진')) {
        sendResponse({
          immediateSkip: true,
          immediateError: '포토/사진 리뷰는 자동 작성 제외(수동 등록) 대상입니다.',
        });
        return;
      }

      const task = {
        requestId: payload.requestId || `req-${Date.now()}`,
        purchaseId: payload.purchaseId,
        webTabId,
        webWindowId,
        accountHolder: targetAccount,
        productName: (payload.productName || '').trim(),
        purchaseDate: (payload.purchaseDate || '').trim(),
        chatRoomName: (payload.chatRoomName || '').trim(),
        reviewType,
        reviewText: (payload.reviewText || '').trim(),
        stage: 'FIND_PRODUCT',
        reloadCount: 0,
        bgReloadCount: 0,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      // 스토리지에 먼저 태스크를 기록하여 탭 전환/로드 시 레이스 컨디션 방지
      await chrome.storage.local.set({ activeReviewTask: task });
      startWatchdog();

      // 기존 쿠팡 탭 탐색 또는 새 탭 생성
      // - 만약 이전 상품을 못 찾아서 이미 리뷰 작성 대기 목록(productreview/reviewable)에 머물러 있다면,
      //   페이지를 새로고침(재진입)하지 않고 이미 로드된 목록 상태에서 바로 다음 상품을 찾는다!
      // - 만약 이전 상품을 작성 완료하여 작성한 리뷰(wroteReviews) 페이지 등에 있다면 다시 리뷰 작성 대기 목록으로 이동한다.
      let coupangTab = null;
      let reusedLoadedReviewableTab = false;
      const existingTabs = await chrome.tabs.query({
        windowId: webWindowId,
        url: ['https://my.coupang.com/*', 'https://mc.coupang.com/*'],
      });

      if (existingTabs.length > 0) {
        const currentUrl = existingTabs[0].url || '';
        if (currentUrl.includes('productreview/reviewable')) {
          coupangTab = await chrome.tabs.update(existingTabs[0].id, {
            active: true,
          });
          reusedLoadedReviewableTab = true;
        } else {
          coupangTab = await chrome.tabs.update(existingTabs[0].id, {
            url: COUPANG_REVIEW_WAIT_URL,
            active: true,
          });
        }
      } else {
        coupangTab = await chrome.tabs.create({
          windowId: webWindowId,
          url: COUPANG_REVIEW_WAIT_URL,
          active: true,
        });
      }

      task.coupangTabId = coupangTab.id;
      await chrome.storage.local.set({ activeReviewTask: task });

      if (reusedLoadedReviewableTab) {
        try {
          await chrome.tabs.sendMessage(coupangTab.id, { type: 'RUN_REVIEW_TASK_NOW' });
        } catch {
          // 만약 콘텐츠 스크립트가 아직 연결되지 않은 탭이라면 URL 이동으로 폴백
          await chrome.tabs.update(coupangTab.id, {
            url: COUPANG_REVIEW_WAIT_URL,
            active: true,
          });
        }
      }

      // MAIN world alert/confirm 무조건 가로채기 사전 주입
      try {
        await chrome.scripting.executeScript({
          target: { tabId: coupangTab.id, allFrames: true },
          world: 'MAIN',
          injectImmediately: true,
          func: () => {
            window.alert = (m) => {
              console.log('[쿠팡매니저 MAIN override] alert 자동 통과:', m);
              try {
                window.dispatchEvent(
                  new CustomEvent('__COUPANG_MANAGER_ALERT__', { detail: { message: String(m || '') } })
                );
              } catch (_) {}
              return true;
            };
            window.confirm = (m) => {
              console.log('[쿠팡매니저 MAIN override] confirm 자동 승인:', m);
              return true;
            };
          },
        });
      } catch (_) {}

      sendResponse({ started: true, coupangTabId: coupangTab.id });
    })();
    return true;
  }

  // 2-1. MAIN 월드 alert 오버라이드 보강 요청
  if (message.type === 'ENSURE_ALERT_OVERRIDE') {
    (async () => {
      const tabId = sender.tab?.id;
      if (tabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            world: 'MAIN',
            injectImmediately: true,
            func: () => {
              window.alert = (m) => {
                console.log('[쿠팡매니저 MAIN override] alert 즉시 자동 수락:', m);
                try {
                  window.dispatchEvent(
                    new CustomEvent('__COUPANG_MANAGER_ALERT__', { detail: { message: String(m || '') } })
                  );
                } catch (_) {}
                return true;
              };
              window.confirm = (m) => {
                console.log('[쿠팡매니저 MAIN override] confirm 즉시 자동 승인:', m);
                return true;
              };
            },
          });
        } catch (_) {}
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // 2-2. 객관식 라디오 설문 애매한 문항 AI 선택 요청 중계 (쿠팡 탭 -> 웹 대시보드 탭)
  if (message.type === 'ASK_AI_SURVEY_OPTIONS') {
    (async () => {
      try {
        const { activeReviewTask } = await chrome.storage.local.get('activeReviewTask');
        const webTabId = activeReviewTask?.webTabId;
        if (!webTabId) {
          sendResponse({ success: false, selections: {} });
          return;
        }

        const res = await Promise.race([
          chrome.tabs.sendMessage(webTabId, {
            type: 'SELECT_SURVEY_OPTIONS_AI',
            payload: {
              productName: message.productName || '',
              questions: message.questions || [],
            },
          }),
          new Promise((r) => setTimeout(() => r({ success: false, selections: {} }), 9000)),
        ]);

        sendResponse(res || { success: false, selections: {} });
      } catch {
        sendResponse({ success: false, selections: {} });
      }
    })();
    return true;
  }

  // 3. 작업 취소
  if (message.type === 'CANCEL_REVIEW_TASK') {
    (async () => {
      stopWatchdog();
      await chrome.storage.local.remove('activeReviewTask');
      sendResponse({ cancelled: true });
    })();
    return true;
  }

  // 4. 진행 상태 웹 탭으로 중계 (활동 시각 갱신)
  if (message.type === 'PROGRESS_REVIEW_TASK') {
    (async () => {
      const { activeReviewTask } = await chrome.storage.local.get('activeReviewTask');
      if (activeReviewTask) {
        activeReviewTask.lastActivityAt = Date.now();
        await chrome.storage.local.set({ activeReviewTask });
      }
      if (activeReviewTask?.webTabId) {
        await notifyWebTab(activeReviewTask.webTabId, 'REVIEW_TASK_PROGRESS', {
          requestId: activeReviewTask.requestId,
          purchaseId: activeReviewTask.purchaseId,
          stepText: message.stepText || '',
        });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // 5. 현재 보이는 쿠팡 탭 화면 캡처 (li.my-review__wrote__list 크롭용 원본)
  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    (async () => {
      try {
        const tab = sender.tab;
        if (!tab) throw new Error('캡처할 쿠팡 탭 정보를 찾을 수 없습니다.');

        await chrome.tabs.update(tab.id, { active: true });
        await new Promise((r) => setTimeout(r, 180));

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
        });
        sendResponse({ success: true, dataUrl });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || '화면 캡처에 실패했습니다.',
        });
      }
    })();
    return true;
  }

  // 6. 크롭된 리뷰 인증 이미지 로컬 다운로드 폴더 저장 및 완료 처리
  if (message.type === 'SAVE_CROPPED_IMAGE') {
    (async () => {
      const store = await chrome.storage.local.get([
        'activeReviewTask',
        'folderName',
        'includeAccountPrefix',
        'assignedAccount',
      ]);
      const task = store.activeReviewTask;
      const folder = sanitizeFilePart(store.folderName || '쿠팡리뷰인증', 40) || '쿠팡리뷰인증';
      const includePrefix = store.includeAccountPrefix !== false;

      const rawAccount =
        message.accountHolder ||
        task?.accountHolder ||
        store.assignedAccount ||
        message.detectedAccountName ||
        '';
      const safeAccount = sanitizeFilePart(rawAccount, 25);
      const safeProduct =
        sanitizeFilePart(message.productName || task?.productName || '리뷰인증', 80) ||
        '리뷰인증';

      // 구매일 + 카톡방명 기반 하위 폴더 생성 (예: "2026-10-30 젖산마그네슘")
      const rawDate = message.purchaseDate || task?.purchaseDate || '';
      const rawChatRoom = message.chatRoomName || task?.chatRoomName || '';
      const safeDate = sanitizeFilePart(rawDate, 30);
      const safeChatRoom = sanitizeFilePart(rawChatRoom, 50);

      const subFolderParts = [safeDate, safeChatRoom].filter(Boolean);
      const subFolder = subFolderParts.length > 0 ? sanitizeFilePart(subFolderParts.join(' '), 80) : '';

      const fileBaseName =
        includePrefix && safeAccount
          ? `[${safeAccount}] ${safeProduct}.png`
          : `${safeProduct}.png`;

      const fullPath = subFolder
        ? `${folder}/${subFolder}/${fileBaseName}`
        : `${folder}/${fileBaseName}`;

      try {
        await chrome.downloads.download({
          url: message.croppedDataUrl,
          filename: fullPath,
          saveAs: false,
          conflictAction: 'uniquify',
        });

        stopWatchdog();
        await chrome.storage.local.remove('activeReviewTask');

        if (task?.webTabId) {
          await notifyWebTab(task.webTabId, 'REVIEW_TASK_RESULT', {
            requestId: task.requestId,
            purchaseId: task.purchaseId,
            success: true,
            fileName: fullPath,
            detectedAccountName: message.detectedAccountName || task?.detectedAccountName || '',
          });
          try {
            await chrome.tabs.update(task.webTabId, { active: true });
          } catch {
            // ignore
          }
        }

        sendResponse({ success: true, fileName: fullPath });
      } catch (err) {
        if (task?.webTabId) {
          await notifyWebTab(task.webTabId, 'REVIEW_TASK_RESULT', {
            requestId: task.requestId,
            purchaseId: task.purchaseId,
            success: false,
            error: `이미지 저장 실패: ${err?.message || err}`,
          });
        }
        stopWatchdog();
        await chrome.storage.local.remove('activeReviewTask');
        sendResponse({ success: false, error: err?.message || '다운로드 실패' });
      }
    })();
    return true;
  }

  // 7. 주문목록 미검색/배송중/기작성 등으로 인한 스킵 처리 (완료 체크 없이 다음 상품 진행)
  if (message.type === 'SKIP_REVIEW_TASK') {
    (async () => {
      stopWatchdog();
      const { activeReviewTask: task } = await chrome.storage.local.get('activeReviewTask');
      await chrome.storage.local.remove('activeReviewTask');

      if (task?.webTabId) {
        await notifyWebTab(task.webTabId, 'REVIEW_TASK_RESULT', {
          requestId: task.requestId,
          purchaseId: task.purchaseId,
          success: false,
          skipped: true,
          detectedAccountName: message.detectedAccountName || task?.detectedAccountName || '',
          error: message.reason || '작성 가능한 리뷰가 없어 건너뜁니다.',
        });
        try {
          await chrome.tabs.update(task.webTabId, { active: true });
        } catch {
          // ignore
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // 8. 작업 실패 처리
  if (message.type === 'FAIL_REVIEW_TASK') {
    (async () => {
      stopWatchdog();
      const { activeReviewTask: task } = await chrome.storage.local.get('activeReviewTask');
      await chrome.storage.local.remove('activeReviewTask');

      if (task?.webTabId) {
        await notifyWebTab(task.webTabId, 'REVIEW_TASK_RESULT', {
          requestId: task.requestId,
          purchaseId: task.purchaseId,
          success: false,
          error: message.error || '자동 등록 중 오류가 발생했습니다.',
        });
        try {
          await chrome.tabs.update(task.webTabId, { active: true });
        } catch {
          // ignore
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});
