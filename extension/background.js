// 쿠팡매니저 크롬 확장 프로그램 Service Worker (background.js)

const COUPANG_REVIEW_WAIT_URL = 'https://my.coupang.com/productreview/reviewable';

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

  // 2. 자동 리뷰 작성 작업 시작
  if (message.type === 'START_REVIEW_TASK') {
    (async () => {
      const payload = message.payload || {};
      const webTabId = sender.tab?.id;
      const webWindowId = sender.tab?.windowId;

      const settings = await chrome.storage.local.get(['assignedAccount']);
      const assignedAccount = (settings.assignedAccount || '').trim();
      const targetAccount = (payload.accountHolder || '').trim();
      const reviewType = (payload.reviewType || '').trim();

      // [규칙 1] 팝업에 고정된 담당 계정주와 요청 계정주 비교
      if (assignedAccount && targetAccount && assignedAccount !== targetAccount) {
        sendResponse({
          immediateError: `계정주 불일치! 현재 크롬 창의 담당 계정주는 [${assignedAccount}]인데, 선택한 항목은 [${targetAccount}]입니다. [${targetAccount}] 크롬 창에서 실행해주세요.`,
        });
        return;
      }

      // [규칙 2] 포토 리뷰 스킵
      if (reviewType.includes('포토') || reviewType.includes('사진')) {
        sendResponse({
          immediateError: '포토/사진 리뷰는 자동 작성 제외(수동 등록) 대상입니다.',
        });
        return;
      }

      // 기존 쿠팡 탭 탐색 또는 새 탭 생성
      let coupangTab = null;
      const existingTabs = await chrome.tabs.query({
        windowId: webWindowId,
        url: ['https://my.coupang.com/*', 'https://mc.coupang.com/*'],
      });

      if (existingTabs.length > 0) {
        coupangTab = await chrome.tabs.update(existingTabs[0].id, {
          url: COUPANG_REVIEW_WAIT_URL,
          active: true,
        });
      } else {
        coupangTab = await chrome.tabs.create({
          windowId: webWindowId,
          url: COUPANG_REVIEW_WAIT_URL,
          active: true,
        });
      }

      const task = {
        requestId: payload.requestId || `req-${Date.now()}`,
        purchaseId: payload.purchaseId,
        webTabId,
        webWindowId,
        coupangTabId: coupangTab.id,
        accountHolder: targetAccount,
        productName: (payload.productName || '').trim(),
        reviewType,
        reviewText: (payload.reviewText || '').trim(),
        stage: 'FIND_PRODUCT',
        startedAt: Date.now(),
      };

      await chrome.storage.local.set({ activeReviewTask: task });
      sendResponse({ started: true, coupangTabId: coupangTab.id });
    })();
    return true;
  }

  // 3. 작업 취소
  if (message.type === 'CANCEL_REVIEW_TASK') {
    (async () => {
      await chrome.storage.local.remove('activeReviewTask');
      sendResponse({ cancelled: true });
    })();
    return true;
  }

  // 4. 진행 상태 웹 탭으로 중계
  if (message.type === 'PROGRESS_REVIEW_TASK') {
    (async () => {
      const { activeReviewTask } = await chrome.storage.local.get('activeReviewTask');
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

      const fileBaseName =
        includePrefix && safeAccount
          ? `[${safeAccount}] ${safeProduct}.png`
          : `${safeProduct}.png`;
      const fullPath = `${folder}/${fileBaseName}`;

      try {
        await chrome.downloads.download({
          url: message.croppedDataUrl,
          filename: fullPath,
          saveAs: false,
          conflictAction: 'uniquify',
        });

        await chrome.storage.local.remove('activeReviewTask');

        if (task?.webTabId) {
          // 웹 대시보드 탭으로 완료 알림 전송
          await notifyWebTab(task.webTabId, 'REVIEW_TASK_RESULT', {
            requestId: task.requestId,
            purchaseId: task.purchaseId,
            success: true,
            fileName: fullPath,
          });
          // 웹 탭으로 다시 포커스 이동
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
        await chrome.storage.local.remove('activeReviewTask');
        sendResponse({ success: false, error: err?.message || '다운로드 실패' });
      }
    })();
    return true;
  }

  // 7. 작업 실패 처리
  if (message.type === 'FAIL_REVIEW_TASK') {
    (async () => {
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
