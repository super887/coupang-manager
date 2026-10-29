// 쿠팡 마이페이지(my.coupang.com) 자동 리뷰 작성 및 인증 영역 캡처 스크립트

(function () {
  if (window.__COUPANG_MANAGER_CONTENT_SCRIPT__) return;
  window.__COUPANG_MANAGER_CONTENT_SCRIPT__ = true;

  let isRunningStage = false;
  let bannerEl = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 화면 우측 상단 진행상태 플로팅 배너 (캡처 직전에는 숨김 처리)
  function showBanner(text) {
    try {
      if (!bannerEl) {
        bannerEl = document.createElement('div');
        bannerEl.id = '__cp_mgr_floating_banner__';
        bannerEl.style.cssText = [
          'position: fixed',
          'top: 16px',
          'right: 16px',
          'z-index: 2147483647',
          'background: linear-gradient(135deg, #6d28d9, #4f46e5)',
          'color: #ffffff',
          'padding: 12px 18px',
          'border-radius: 12px',
          'box-shadow: 0 10px 25px rgba(0,0,0,0.25)',
          'font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif',
          'font-size: 13px',
          'font-weight: 700',
          'display: flex',
          'align-items: center',
          'gap: 8px',
          'pointer-events: none',
        ].join(';');
        document.body.appendChild(bannerEl);
      }
      bannerEl.style.display = 'flex';
      bannerEl.textContent = `🚀 [쿠팡매니저] ${text}`;
    } catch {
      // ignore
    }
  }

  function hideBanner() {
    if (bannerEl) {
      bannerEl.style.display = 'none';
    }
  }

  async function reportProgress(stepText) {
    showBanner(stepText);
    try {
      await chrome.runtime.sendMessage({
        type: 'PROGRESS_REVIEW_TASK',
        stepText,
      });
    } catch {
      // ignore
    }
  }

  async function failTask(errorMsg) {
    hideBanner();
    isRunningStage = false;
    try {
      await chrome.runtime.sendMessage({
        type: 'FAIL_REVIEW_TASK',
        error: errorMsg,
      });
    } catch {
      // ignore
    }
  }

  // 쿠팡 화면에서 현재 로그인된 사용자 이름(예: "김*연" 또는 "김수연") 추출
  function detectCoupangUserName() {
    // 1. 리뷰관리 상단 프로필 영역 (예: 김*연)
    const bodyText = document.body?.innerText || '';
    const maskedMatch = bodyText.match(/([가-힣]\*+[가-힣]+)/);
    if (maskedMatch && maskedMatch[1]) {
      return maskedMatch[1].trim();
    }

    // 2. 상단 헤더 GNB 영역 "OOO님"
    const headerMatch = bodyText.match(/([가-힣*]{2,5})\s*님/);
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1].trim();
    }

    return '';
  }

  // 요청된 계정주("김수연")와 쿠팡 화면의 이름("김*연" 등)이 일치하는지 확인
  function isAccountNameMatch(expectedAccount, detectedName) {
    const exp = (expectedAccount || '').replace(/\s+/g, '').replace(/님$/, '');
    const det = (detectedName || '').replace(/\s+/g, '').replace(/님$/, '');

    if (!exp || !det) return true;
    if (exp === det) return true;

    // 마스킹 이름(예: 김*연, 수*) 비교
    if (det.includes('*')) {
      const firstCharMatch = exp[0] === det[0];
      if (!firstCharMatch) return false;

      const lastDetChar = det[det.length - 1];
      if (lastDetChar !== '*') {
        const lastExpChar = exp[exp.length - 1];
        if (lastExpChar !== lastDetChar) return false;
      }
      return true;
    }

    return exp.includes(det) || det.includes(exp);
  }

  // 상품명 정규화 및 부분 일치 매칭
  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[\s\[\]\(\)\{\},.·/\\~!\-_+*'"`✨🚀]+/g, '');
  }

  function isProductNameMatch(webProductName, cardText) {
    const normWeb = normalizeText(webProductName);
    const normCard = normalizeText(cardText);
    if (!normWeb || !normCard) return false;

    // 1. 띄어쓰기/특수문자 무시 부분 일치
    if (normCard.includes(normWeb) || (normWeb.length >= 6 && normWeb.includes(normCard) && normCard.length >= 6)) {
      return true;
    }

    // 2. 단어 토큰 매칭 (웹 상품명의 주요 단어들이 카드 텍스트에 모두 포함되는지)
    const tokens = String(webProductName || '')
      .replace(/[\[\]\(\)\{\},.\/\\~!\-_+*]+/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (tokens.length >= 2) {
      const matchedTokens = tokens.filter((t) => normCard.includes(normalizeText(t)));
      if (matchedTokens.length === tokens.length) {
        return true;
      }
    }

    return false;
  }

  // 마우스 클릭 이벤트 시뮬레이션
  function triggerClick(el) {
    if (!el) return;
    const events = ['mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click'];
    for (const evType of events) {
      el.dispatchEvent(
        new MouseEvent(evType, {
          bubbles: true,
          cancelable: true,
          view: window,
        })
      );
    }
    if (typeof el.click === 'function') {
      el.click();
    }
  }

  // [Stage 1] 리뷰 작성 대기 목록에서 상품 탐색 (무한 스크롤 최대 15회)
  async function executeFindProductStage(task) {
    await reportProgress('쿠팡 로그인 및 계정주 확인 중...');
    await sleep(600);

    if (location.hostname.includes('login.coupang.com') || document.querySelector('#login-email-input')) {
      await failTask('쿠팡 로그인이 필요합니다. 먼저 이 크롬 창에서 쿠팡에 로그인해주세요.');
      return;
    }

    // 계정주 검증
    const detectedName = detectCoupangUserName();
    if (task.accountHolder && detectedName && !isAccountNameMatch(task.accountHolder, detectedName)) {
      await failTask(
        `계정주 불일치! 현재 쿠팡 로그인 계정(${detectedName})과 선택한 상품의 계정주(${task.accountHolder})가 다릅니다.`
      );
      return;
    }

    // 만약 현재 화면에 이미 "상품 품질 리뷰" 작성 폼이 열려있다면 바로 Stage 2로 전환
    if (document.body.innerText.includes('상품 품질 리뷰')) {
      const updated = { ...task, stage: 'FILL_FORM' };
      await chrome.storage.local.set({ activeReviewTask: updated });
      await executeFillFormStage(updated);
      return;
    }

    // 만약 "작성한 리뷰" 탭에 있다면 "리뷰 작성" 탭 클릭
    const allClickables = Array.from(document.querySelectorAll('a, button, li, div, span'));
    const writeTab = allClickables.find((el) => {
      const txt = (el.innerText || '').trim();
      return /^리뷰\s*작성(\s*\d+.*)?$/.test(txt) && el.children.length <= 2;
    });
    if (writeTab && location.href.includes('wroteReviews')) {
      triggerClick(writeTab);
      await sleep(900);
    }

    const maxScrolls = 15;
    for (let attempt = 1; attempt <= maxScrolls; attempt++) {
      await reportProgress(`상품 찾는 중... (${attempt}/${maxScrolls}) "${task.productName.slice(0, 18)}"`);

      // 화면 내 모든 "리뷰 작성하기" 버튼 수집
      const writeButtons = Array.from(
        document.querySelectorAll('button, a, div[role="button"], span, input[type="button"]')
      ).filter((el) => {
        const t = (el.innerText || el.value || '').trim();
        return t === '리뷰 작성하기' && el.offsetParent !== null;
      });

      for (const btn of writeButtons) {
        const card =
          btn.closest('li, tr, article, [class*="list"], [class*="item"]') ||
          btn.parentElement?.parentElement ||
          btn.parentElement;

        const cardText = card ? card.innerText || '' : '';
        if (isProductNameMatch(task.productName, cardText)) {
          await reportProgress('상품 발견! 리뷰 작성 화면으로 이동합니다...');
          if (card && card.scrollIntoView) {
            card.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          await sleep(350);

          // 다음 단계(FILL_FORM)로 상태 저장 후 클릭
          const nextTask = { ...task, stage: 'FILL_FORM', detectedAccountName: detectedName };
          await chrome.storage.local.set({ activeReviewTask: nextTask });

          triggerClick(btn);

          // SPA 전환 대비: 페이지 리로드가 일어나지 않더라도 1초 후 폼 진입 체크
          await sleep(1000);
          isRunningStage = false;
          await checkAndRunTask();
          return;
        }
      }

      // 못 찾았으면 맨 아래로 스크롤하여 다음 10개 로딩 유도
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await sleep(850);
    }

    await failTask(
      `쿠팡 [리뷰 작성] 목록에서 "${task.productName}" 상품을 찾지 못했습니다. (이미 작성했거나 배송완료 전일 수 있습니다)`
    );
  }

  // 별점 5점 클릭 헬퍼
  function clickFiveStarRating() {
    // 1. 별점 컨테이너 패턴 탐색
    const starContainers = document.querySelectorAll(
      '[class*="star"], [class*="rating"], [class*="score"], .js_reviewModifyStar'
    );

    for (const container of starContainers) {
      const children = Array.from(
        container.querySelectorAll('button, a, span, i, label, em')
      ).filter((el) => el.offsetParent !== null);
      if (children.length >= 5) {
        triggerClick(children[4]);
        return true;
      }
    }

    // 2. "(필수)" 텍스트 주변의 5개 형제 별 아이콘 탐색
    const allSpans = Array.from(document.querySelectorAll('span, div, em, p'));
    const reqLabel = allSpans.find((el) => (el.innerText || '').trim().startsWith('(필수)'));
    if (reqLabel && reqLabel.parentElement) {
      const parent = reqLabel.parentElement;
      const starCandidates = Array.from(parent.querySelectorAll('button, a, span, i, svg, img')).filter(
        (el) => el !== reqLabel && !reqLabel.contains(el) && el.offsetParent !== null
      );
      if (starCandidates.length >= 5) {
        triggerClick(starCandidates[4]);
        return true;
      }
      if (reqLabel.previousElementSibling) {
        const prevChildren = Array.from(reqLabel.previousElementSibling.children);
        if (prevChildren.length >= 5) {
          triggerClick(prevChildren[4]);
          return true;
        }
      }
    }

    return false;
  }

  // React/모던 프레임워크 호환 Textarea 값 주입
  function setTextareaValue(textarea, text) {
    textarea.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, text);
    } else {
      textarea.value = text;
    }
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  // [Stage 2] 상품 품질 리뷰 폼 작성 (별점 5점 + 리뷰타입별 분기 + 등록하기 클릭)
  async function executeFillFormStage(task) {
    await reportProgress('리뷰 작성 폼 로딩 대기 중...');

    // 최대 10초 동안 폼(등록하기 버튼 또는 textarea) 등장 대기
    let submitBtn = null;
    for (let i = 0; i < 20; i++) {
      const buttons = Array.from(
        document.querySelectorAll('button, a, div[role="button"], input[type="button"], input[type="submit"]')
      );
      submitBtn = buttons.find((el) => {
        const t = (el.innerText || el.value || '').trim();
        return t === '등록하기' && el.offsetParent !== null;
      });
      if (submitBtn) break;
      await sleep(500);
    }

    if (!submitBtn) {
      await failTask('쿠팡 리뷰 작성 폼([등록하기] 버튼)을 찾지 못했습니다.');
      return;
    }

    await reportProgress('별점 5점 선택 중...');
    await sleep(300);
    clickFiveStarRating();
    await sleep(400);

    const isStarOnly = (task.reviewType || '').includes('별점');

    if (!isStarOnly) {
      await reportProgress('AI 리뷰 본문 입력 중...');
      const textareas = Array.from(document.querySelectorAll('textarea')).filter(
        (el) => el.offsetParent !== null
      );
      const reviewTextarea =
        textareas.find((el) => (el.placeholder || '').includes('평가') || (el.placeholder || '').includes('리뷰')) ||
        textareas[0];

      if (!reviewTextarea) {
        await failTask('상세 리뷰 입력창(textarea)을 찾지 못했습니다.');
        return;
      }

      if (task.reviewText) {
        setTextareaValue(reviewTextarea, task.reviewText);
      }
      await sleep(450);
    } else {
      await reportProgress('별점 전용 타입: 텍스트 없이 별점 5점만 등록합니다...');
      await sleep(300);
    }

    // [합의 사항] 한줄 요약 칸은 입력하지 않고 빈칸 유지!

    // 다음 단계(CAPTURE_WROTE_REVIEW)로 상태 전환 후 [등록하기] 클릭
    const nextTask = { ...task, stage: 'CAPTURE_WROTE_REVIEW' };
    await chrome.storage.local.set({ activeReviewTask: nextTask });

    await reportProgress('리뷰 [등록하기] 클릭 중...');
    submitBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(250);
    triggerClick(submitBtn);

    // 만약 확인 모달/버튼이 뜨거나 SPA로 전환될 경우를 대비해 대기 후 Stage 3 호출
    await sleep(1200);
    isRunningStage = false;
    await checkAndRunTask();
  }

  // 데이터 URL 이미지를 특정 영역(rect, dpr)으로 크롭하여 PNG DataURL 반환
  function cropImageFromDataUrl(dataUrl, rect, dpr) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const sx = Math.max(0, Math.round(rect.left * dpr));
          const sy = Math.max(0, Math.round(rect.top * dpr));
          const sw = Math.min(img.width - sx, Math.round(rect.width * dpr));
          const sh = Math.min(img.height - sy, Math.round(rect.height * dpr));

          if (sw <= 0 || sh <= 0) {
            reject(new Error('캡처 영역 크기가 유효하지 않습니다.'));
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sw, sh);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('캡처 이미지 로드에 실패했습니다.'));
      img.src = dataUrl;
    });
  }

  // [Stage 3] 작성한 리뷰 탭에서 최상단 li.my-review__wrote__list 영역 캡처 및 저장
  async function executeCaptureStage(task) {
    await reportProgress('[작성한 리뷰] 목록 로딩 대기 중...');

    let targetLi = null;

    for (let i = 0; i < 24; i++) {
      // 확인 팝업이나 모달 버튼이 떠 있으면 눌러주기
      const confirmBtns = Array.from(document.querySelectorAll('button, a')).filter((el) => {
        const t = (el.innerText || '').trim();
        return (t === '확인' || t === '닫기') && el.offsetParent !== null;
      });
      if (confirmBtns.length > 0 && !document.querySelector('li.my-review__wrote__list, li.my-review__wrote_list')) {
        triggerClick(confirmBtns[0]);
        await sleep(400);
      }

      // 1순위: 정확한 클래스 셀렉터 (li.my-review__wrote__list / li.my-review__wrote_list)
      targetLi = document.querySelector(
        'li.my-review__wrote__list, li.my-review__wrote_list, li[class*="my-review__wrote"]'
      );

      if (targetLi && targetLi.offsetParent !== null) {
        break;
      }

      // 만약 4초가 지났는데도 작성한 리뷰 목록이 안 보이면 "작성한 리뷰" 탭 클릭 시도
      if (i === 7) {
        const tabs = Array.from(document.querySelectorAll('a, button, li, div, span'));
        const wroteTab = tabs.find((el) => {
          const txt = (el.innerText || '').trim();
          return /^작성한\s*리뷰(\s*\d+.*)?$/.test(txt) && el.children.length <= 2;
        });
        if (wroteTab) {
          triggerClick(wroteTab);
        } else if (!location.href.includes('wroteReviews')) {
          location.href = 'https://my.coupang.com/productreview/wroteReviews';
          return;
        }
      }

      await sleep(500);
    }

    if (!targetLi) {
      await failTask('작성된 리뷰 항목(li.my-review__wrote__list)을 찾지 못했습니다.');
      return;
    }

    await reportProgress('인증 캡처 영역 정렬 중...');

    // 내부 썸네일 이미지 로딩 완료 대기
    const imgs = Array.from(targetLi.querySelectorAll('img'));
    for (const img of imgs) {
      if (!img.complete) {
        await new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
          setTimeout(r, 1200);
        });
      }
    }

    // 해당 영역이 화면 중앙에 온전히 보이도록 즉시 스크롤
    targetLi.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    // 캡처에 플로팅 배너가 찍히지 않도록 숨김
    hideBanner();
    await sleep(350);

    const rect = targetLi.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // 백그라운드에 현재 탭 캡처 요청
    const capRes = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
    if (!capRes || !capRes.success || !capRes.dataUrl) {
      await failTask(capRes?.error || '화면 캡처에 실패했습니다.');
      return;
    }

    try {
      const croppedDataUrl = await cropImageFromDataUrl(capRes.dataUrl, rect, dpr);
      const detectedName = detectCoupangUserName() || task.detectedAccountName || '';

      showBanner('이미지 다운로드 및 대시보드 완료 체크 중...');
      await chrome.runtime.sendMessage({
        type: 'SAVE_CROPPED_IMAGE',
        croppedDataUrl,
        accountHolder: task.accountHolder,
        productName: task.productName,
        detectedAccountName: detectedName,
      });
      await sleep(600);
      hideBanner();
    } catch (err) {
      await failTask(`캡처 이미지 크롭/저장 오류: ${err?.message || err}`);
    }
  }

  async function checkAndRunTask() {
    if (isRunningStage) return;

    try {
      const { activeReviewTask: task } = await chrome.storage.local.get('activeReviewTask');
      if (!task || !task.stage) return;

      // 2분 이상 경과된 오래된 작업은 자동 폐기
      if (Date.now() - (task.startedAt || 0) > 120000) {
        await chrome.storage.local.remove('activeReviewTask');
        return;
      }

      isRunningStage = true;

      if (task.stage === 'FIND_PRODUCT') {
        await executeFindProductStage(task);
      } else if (task.stage === 'FILL_FORM') {
        await executeFillFormStage(task);
      } else if (task.stage === 'CAPTURE_WROTE_REVIEW') {
        await executeCaptureStage(task);
      }
    } catch (err) {
      await failTask(`자동화 실행 오류: ${err?.message || err}`);
    } finally {
      isRunningStage = false;
    }
  }

  // 페이지 진입 시 자동 체크
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkAndRunTask, 300));
  } else {
    setTimeout(checkAndRunTask, 300);
  }
})();
