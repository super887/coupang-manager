// 쿠팡매니저 웹 대시보드 <-> 크롬 확장 프로그램 브릿지 스크립트
(function () {
  if (window.__COUPANG_MANAGER_WEB_BRIDGE__) return;
  window.__COUPANG_MANAGER_WEB_BRIDGE__ = true;

  // 웹 페이지가 확장 프로그램 설치 여부를 즉시 감지할 수 있도록 DOM 속성 주입
  document.documentElement.setAttribute('data-coupang-ext-installed', 'true');
  document.documentElement.setAttribute('data-coupang-ext-version', '1.0.0');

  // 웹 페이지 -> 확장 프로그램 백그라운드 전달
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || typeof event.data.type !== 'string') {
      return;
    }

    const { type, payload } = event.data;

    if (type === 'CP_EXT_PING') {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'GET_EXT_STATUS',
          knownAccounts: payload?.knownAccounts || [],
        });
        window.postMessage(
          {
            type: 'CP_EXT_PONG',
            payload: {
              installed: true,
              assignedAccount: res?.assignedAccount || '',
            },
          },
          '*'
        );
      } catch {
        // 확장 프로그램 리로드 직후 등 예외 무시
      }
    } else if (type === 'CP_EXT_START_REVIEW') {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'START_REVIEW_TASK',
          payload,
        });
        if (res && res.immediateError) {
          window.postMessage(
            {
              type: 'CP_EXT_REVIEW_RESULT',
              payload: {
                requestId: payload?.requestId,
                purchaseId: payload?.purchaseId,
                success: false,
                error: res.immediateError,
              },
            },
            '*'
          );
        }
      } catch (err) {
        window.postMessage(
          {
            type: 'CP_EXT_REVIEW_RESULT',
            payload: {
              requestId: payload?.requestId,
              purchaseId: payload?.purchaseId,
              success: false,
              error: '확장 프로그램과 연결이 끊어졌습니다. 페이지를 새로고침 해주세요.',
            },
          },
          '*'
        );
      }
    } else if (type === 'CP_EXT_CANCEL_REVIEW') {
      try {
        await chrome.runtime.sendMessage({ type: 'CANCEL_REVIEW_TASK' });
      } catch {
        // ignore
      }
    }
  });

  // 백그라운드 -> 웹 페이지 결과/진행상태 전달
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'REVIEW_TASK_RESULT') {
      window.postMessage(
        {
          type: 'CP_EXT_REVIEW_RESULT',
          payload: message.payload,
        },
        '*'
      );
    } else if (message.type === 'REVIEW_TASK_PROGRESS') {
      window.postMessage(
        {
          type: 'CP_EXT_REVIEW_PROGRESS',
          payload: message.payload,
        },
        '*'
      );
    }
  });
})();
