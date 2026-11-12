// 쿠팡매니저 웹 대시보드 <-> 크롬 확장 프로그램 브릿지 스크립트
(function () {
  if (window.__COUPANG_MANAGER_WEB_BRIDGE__) return;
  window.__COUPANG_MANAGER_WEB_BRIDGE__ = true;

  // 웹 페이지가 확장 프로그램 설치 여부를 즉시 감지할 수 있도록 DOM 속성 주입
  document.documentElement.setAttribute('data-coupang-ext-installed', 'true');
  document.documentElement.setAttribute('data-coupang-ext-version', '1.3.7');

  const pendingSurveyResolvers = new Map();

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
        if (res && (res.immediateError || res.immediateSkip)) {
          window.postMessage(
            {
              type: 'CP_EXT_REVIEW_RESULT',
              payload: {
                requestId: payload?.requestId,
                purchaseId: payload?.purchaseId,
                success: false,
                skipped: Boolean(res.immediateSkip),
                detectedAccountName: res.detectedAccountName || '',
                error: res.immediateError,
              },
            },
            '*'
          );
        }
      } catch {
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
    } else if (type === 'CP_EXT_SURVEY_AI_RES') {
      const reqId = payload?.surveyReqId;
      if (reqId && pendingSurveyResolvers.has(reqId)) {
        const resolve = pendingSurveyResolvers.get(reqId);
        pendingSurveyResolvers.delete(reqId);
        resolve({
          success: Boolean(payload?.success),
          selections: payload?.selections || {},
        });
      }
    }
  });

  // 백그라운드 -> 웹 페이지 결과/진행상태/AI설문 요청 전달
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'REVIEW_TASK_RESULT') {
      window.postMessage(
        {
          type: 'CP_EXT_REVIEW_RESULT',
          payload: message.payload,
        },
        '*'
      );
      return false;
    }

    if (message.type === 'REVIEW_TASK_PROGRESS') {
      window.postMessage(
        {
          type: 'CP_EXT_REVIEW_PROGRESS',
          payload: message.payload,
        },
        '*'
      );
      return false;
    }

    if (message.type === 'SELECT_SURVEY_OPTIONS_AI') {
      const surveyReqId = `survey-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const timer = setTimeout(() => {
        if (pendingSurveyResolvers.has(surveyReqId)) {
          pendingSurveyResolvers.delete(surveyReqId);
          sendResponse({ success: false, selections: {} });
        }
      }, 8500);

      pendingSurveyResolvers.set(surveyReqId, (res) => {
        clearTimeout(timer);
        sendResponse(res);
      });

      window.postMessage(
        {
          type: 'CP_EXT_SURVEY_AI_REQ',
          payload: {
            surveyReqId,
            productName: message.payload?.productName || '',
            questions: message.payload?.questions || [],
          },
        },
        '*'
      );
      return true;
    }

    return false;
  });
})();
