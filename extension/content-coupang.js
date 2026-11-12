// 쿠팡 마이페이지(my.coupang.com) 자동 리뷰 작성 및 인증 영역 캡처 스크립트

(function () {
  // 최상위 윈도우에서만 실행 (iframe 중복 실행 원천 차단)
  if (window !== window.top) return;
  if (window.__COUPANG_MANAGER_CONTENT_SCRIPT__) return;
  window.__COUPANG_MANAGER_CONTENT_SCRIPT__ = true;

  const REVIEWABLE_URL = 'https://my.coupang.com/productreview/reviewable';

  let isRunningStage = false;
  let hasClickedSubmitOnThisPage = false;
  let bannerEl = null;
  let lastInterceptedAlert = '';

  // inject-page.js (MAIN 월드)에서 발생한 alert/confirm 이벤트 수신
  window.addEventListener('__COUPANG_MANAGER_ALERT__', (e) => {
    const msg = e?.detail?.message || '';
    lastInterceptedAlert = msg;
    console.log('[쿠팡매니저 ContentScript] 감지된 알림창:', msg);
  });

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

  async function skipTask(reasonMsg) {
    hideBanner();
    isRunningStage = false;
    try {
      await chrome.runtime.sendMessage({
        type: 'SKIP_REVIEW_TASK',
        reason: reasonMsg,
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
    if (document.body?.innerText?.includes('찾을 수 없는 페이지')) {
      return '';
    }

    const STOP_WORDS = new Set(['고객', '회원', '손님', '사용자', '관리자', '상담원', '체험단']);
    const bodyText = document.body?.innerText || '';

    // 1. 리뷰관리 상단 프로필 영역 마스킹 이름 (예: 김*연, 이*온)
    const maskedMatches = Array.from(bodyText.matchAll(/([가-힣]\*+[가-힣]+)/g));
    for (const m of maskedMatches) {
      const candidate = (m[1] || '').trim();
      if (candidate && !STOP_WORDS.has(candidate)) {
        return candidate;
      }
    }

    // 2. 상단 헤더 GNB 영역 "OOO님" (단, '고객님', '회원님' 등 제외)
    const headerMatches = Array.from(bodyText.matchAll(/([가-힣*]{2,5})\s*님/g));
    for (const m of headerMatches) {
      const candidate = (m[1] || '').trim();
      if (candidate && !STOP_WORDS.has(candidate)) {
        return candidate;
      }
    }

    return '';
  }

  // 요청된 계정주("김수연")와 쿠팡 화면의 이름("김*연" 등)이 일치하는지 확인
  function isAccountNameMatch(expectedAccount, detectedName) {
    const exp = (expectedAccount || '').replace(/\s+/g, '').replace(/님$/, '');
    const det = (detectedName || '').replace(/\s+/g, '').replace(/님$/, '');

    if (!exp || !det) return true;
    if (exp === det) return true;

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

  // 상품명 정규화 및 부분 일치 매칭 (쉼표 뒤 옵션명 분리 지원)
  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[\s\[\]\(\)\{\},.·/\\~!\-_+*'"`✨🚀]+/g, '');
  }

  function isProductNameMatch(webProductName, cardText) {
    const rawWeb = String(webProductName || '').trim();
    const rawCard = String(cardText || '').trim();
    if (!rawWeb || !rawCard) return false;

    // 쉼표(,)가 포함된 경우 옵션 제외하고 쉼표 앞의 핵심 상품명 우선 추출
    const commaParts = rawWeb.split(/[,，]/);
    const coreName = commaParts[0].trim();

    const normFullWeb = normalizeText(rawWeb);
    const normCoreWeb = normalizeText(coreName);
    const normCard = normalizeText(rawCard);
    if (!normCard) return false;

    // 1. 쉼표(,) 앞의 핵심 상품명으로 우선 일치 검사
    if (commaParts.length > 1 && normCoreWeb.length >= 2) {
      if (normCard.includes(normCoreWeb) || (normCoreWeb.length >= 6 && normCoreWeb.includes(normCard))) {
        return true;
      }
      const coreTokens = coreName
        .replace(/[\[\]\(\)\{\},.\/\\~!\-_+*]+/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
      if (coreTokens.length >= 2) {
        const matched = coreTokens.filter((t) => normCard.includes(normalizeText(t)));
        if (matched.length >= Math.ceil(coreTokens.length * 0.8)) {
          return true;
        }
      }
    }

    // 2. 전체 상품명 띄어쓰기/특수문자 무시 부분 일치
    if (
      normFullWeb &&
      (normCard.includes(normFullWeb) ||
        (normFullWeb.length >= 6 && normFullWeb.includes(normCard) && normCard.length >= 6))
    ) {
      return true;
    }

    // 3. 전체 상품명 단어 토큰 매칭
    const fullTokens = rawWeb
      .replace(/[\[\]\(\)\{\},.\/\\~!\-_+*]+/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (fullTokens.length >= 2) {
      const matchedTokens = fullTokens.filter((t) => normCard.includes(normalizeText(t)));
      if (matchedTokens.length === fullTokens.length) {
        return true;
      }
    }

    return false;
  }

  // 안전한 단일 클릭 실행 (SVG 등 click 미지원 요소 대응)
  function triggerClick(el) {
    if (!el) return;
    const target = el instanceof SVGElement && el.parentElement ? el.parentElement : el;
    try {
      if (typeof target.focus === 'function') target.focus();
    } catch (_) {}
    if (typeof target.click === 'function') {
      target.click();
    } else {
      target.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        })
      );
    }
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

  // 화면 내 모든 활성화된 [리뷰 작성하기] 버튼 조회
  function getVisibleWriteButtons() {
    return Array.from(
      document.querySelectorAll('button, a, div[role="button"], span, input[type="button"]')
    ).filter((el) => {
      if (el.offsetParent === null) return false;
      if (el.closest('header, footer, #header, #footer, .my-area-left')) return false;
      const t = (el.innerText || el.value || '').trim();
      return t === '리뷰 작성하기';
    });
  }

  // [Stage 1] 리뷰 작성 대기 목록(my.coupang.com/productreview/reviewable)에서 상품 탐색 (맨 밑 도달 자동 감지!)
  async function executeFindProductStage(task) {
    await reportProgress('쿠팡 로그인 및 계정주 확인 중...');
    await sleep(600);

    if (location.hostname.includes('login.coupang.com') || document.querySelector('#login-email-input')) {
      await failTask('쿠팡 로그인이 필요합니다. 먼저 이 크롬 창에서 쿠팡에 로그인해주세요.');
      return;
    }

    // 404 잘못된 경로인 경우 리뷰 작성 페이지로 자동 재이동
    if (document.body?.innerText?.includes('찾을 수 없는 페이지')) {
      location.href = REVIEWABLE_URL;
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

    // 초기 목록 렌더링 대기 (최대 3.5초 동안 첫 번째 [리뷰 작성하기] 버튼 또는 빈 목록 문구 대기)
    for (let w = 0; w < 7; w++) {
      if (getVisibleWriteButtons().length > 0) break;
      const bodyTxt = document.body?.innerText || '';
      if (
        bodyTxt.includes('작성 가능한 리뷰가 없습니다') ||
        bodyTxt.includes('작성할 리뷰가 없습니다')
      ) {
        break;
      }
      await sleep(500);
    }

    const maxScrolls = 20;
    const searchTargetName = (task.productName || '').split(/[,，]/)[0].trim() || task.productName;
    let reachedBottomOnce = false;

    for (let attempt = 1; attempt <= maxScrolls; attempt++) {
      await reportProgress(`상품 찾는 중... (${attempt}회차 스크롤) "${searchTargetName.slice(0, 18)}"`);

      const writeButtons = getVisibleWriteButtons();

      // 작성 가능한 리뷰가 아예 0개면 스크롤할 필요 없이 즉시 종료
      if (writeButtons.length === 0) {
        break;
      }

      // 1순위: 전체 상품명(옵션 포함) 완전 일치 카드 탐색 -> 2순위: 핵심 상품명(isProductNameMatch) 탐색
      const normFullWeb = normalizeText(task.productName);
      let matchedBtn = null;
      let matchedCard = null;

      if (normFullWeb.length >= 4) {
        for (const btn of writeButtons) {
          const card =
            btn.closest('li, tr, article, [class*="list"], [class*="item"]') ||
            btn.parentElement?.parentElement ||
            btn.parentElement;
          const cardText = card ? card.innerText || '' : '';
          if (normalizeText(cardText).includes(normFullWeb)) {
            matchedBtn = btn;
            matchedCard = card;
            break;
          }
        }
      }

      if (!matchedBtn) {
        for (const btn of writeButtons) {
          const card =
            btn.closest('li, tr, article, [class*="list"], [class*="item"]') ||
            btn.parentElement?.parentElement ||
            btn.parentElement;
          const cardText = card ? card.innerText || '' : '';
          if (isProductNameMatch(task.productName, cardText)) {
            matchedBtn = btn;
            matchedCard = card;
            break;
          }
        }
      }

      if (matchedBtn) {
        await reportProgress('상품 발견! 리뷰 작성 화면으로 이동합니다...');
        if (matchedCard && matchedCard.scrollIntoView) {
          matchedCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        await sleep(350);

        const nextTask = { ...task, stage: 'FILL_FORM', detectedAccountName: detectedName };
        await chrome.storage.local.set({ activeReviewTask: nextTask });

        triggerClick(matchedBtn);

        for (let w = 0; w < 12; w++) {
          await sleep(300);
          if (location.href.includes('register') || document.body.innerText.includes('상품 품질 리뷰')) {
            isRunningStage = false;
            await checkAndRunTask();
            return;
          }
        }
        return;
      }

      // ===== [맨 밑 도달 자체 검사 로직] =====
      const writableListEl = document.querySelector('#order_based_writables, [data-has-more]');
      const hasMoreAttr = writableListEl?.getAttribute('data-has-more');

      // 쿠팡 DOM이 data-has-more="false"(추가 로딩할 페이지 없음)이고 이미 1회 이상 끝까지 확인했다면 즉시 중단!
      if (hasMoreAttr === 'false' && reachedBottomOnce) {
        break;
      }

      const prevBtnCount = writeButtons.length;
      const prevItemCount = document.querySelectorAll(
        'li.my-review__writable__list, li[class*="writable"]'
      ).length;
      const prevScrollHeight = document.documentElement.scrollHeight;

      // 맨 아래로 스크롤하여 추가 로딩 유도
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      await sleep(700);

      // 만약 쿠팡 리스트가 현재 추가 데이터를 불러오는 중(data-loading-status="loading")이면 완료까지 대기
      for (let l = 0; l < 5; l++) {
        const status = writableListEl?.getAttribute('data-loading-status');
        if (status && status.toLowerCase().includes('load')) {
          await sleep(220);
        } else {
          break;
        }
      }

      const newBtnCount = getVisibleWriteButtons().length;
      const newItemCount = document.querySelectorAll(
        'li.my-review__writable__list, li[class*="writable"]'
      ).length;
      const newScrollHeight = document.documentElement.scrollHeight;
      const nowHasMore = writableListEl?.getAttribute('data-has-more');

      // 스크롤 후에도 새 항목이 전혀 늘어나지 않았고 페이지 높이도 그대로인 경우 -> 맨 밑 도달!
      if (newBtnCount === prevBtnCount && newItemCount === prevItemCount && newScrollHeight <= prevScrollHeight) {
        if (nowHasMore === 'false' || reachedBottomOnce) {
          // 마지막으로 새로 렌더링된 카드가 없는지 1회만 더 루프 상단에서 확인 후 종료하도록 플래그 설정
          if (reachedBottomOnce) break;
          reachedBottomOnce = true;
          continue;
        }

        // 네트워크 지연 가능성을 고려해 0.45초만 한 번 더 기다려보고 여전히 그대로면 즉시 종료!
        await sleep(450);
        const retryBtnCount = getVisibleWriteButtons().length;
        const retryScrollHeight = document.documentElement.scrollHeight;
        if (retryBtnCount === prevBtnCount && retryScrollHeight <= prevScrollHeight) {
          break;
        }
      }

      if (nowHasMore === 'false') {
        reachedBottomOnce = true;
      }
    }

    await skipTask(
      `쿠팡 [리뷰 작성] 목록 끝까지 확인했으나 "${searchTargetName.slice(0, 24)}" 상품을 찾지 못해 건너뜁니다. (배송중 또는 이미 작성 완료)`
    );
  }

  // 별점 5점 클릭 헬퍼
  function clickFiveStarRating() {
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

  // ========== [객관식 설문 라디오버튼 자동 추출 및 긍정 선택 (키워드 규칙 + AI 폴백)] ==========

  function getLowestCommonAncestor(elements) {
    if (!elements || elements.length === 0) return null;
    let candidate = elements[0];
    while (candidate && candidate !== document.body) {
      if (elements.every((el) => candidate.contains(el))) {
        return candidate;
      }
      candidate = candidate.parentElement;
    }
    return document.body;
  }

  // 화면 내 모든 객관식 설문 라디오 문항 그룹 추출
  function extractSurveyRadioGroups() {
    const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')).filter((r) => {
      if (r.disabled) return false;
      if (r.closest('header, footer, nav, #header, #footer, .my-area-left, #mc-left-menu')) {
        return false;
      }
      const label =
        r.closest('label') || (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null);
      const visibleTarget = label || r.parentElement || r;
      return visibleTarget.offsetParent !== null;
    });

    const groupedMap = new Map();
    let unnamedCounter = 0;

    for (const radio of allRadios) {
      let key = '';
      if (radio.name && radio.name.trim()) {
        key = `name:${radio.name.trim()}`;
      } else {
        let anc = radio.parentElement;
        while (anc && anc !== document.body) {
          const cnt = anc.querySelectorAll('input[type="radio"]').length;
          if (cnt >= 2 && cnt <= 7) break;
          anc = anc.parentElement;
        }
        if (anc && anc !== document.body) {
          if (!anc.dataset.cpRadioGroupId) {
            anc.dataset.cpRadioGroupId = `grp_${++unnamedCounter}`;
          }
          key = `anc:${anc.dataset.cpRadioGroupId}`;
        } else {
          key = `single:${++unnamedCounter}`;
        }
      }

      if (!groupedMap.has(key)) groupedMap.set(key, []);
      groupedMap.get(key).push(radio);
    }

    const groups = [];
    let groupId = 0;

    for (const [, radios] of groupedMap.entries()) {
      if (radios.length < 2) continue;

      const options = radios.map((radio) => {
        const label =
          radio.closest('label') ||
          (radio.id ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`) : null);
        const singleParent =
          !label &&
          radio.parentElement &&
          radio.parentElement.querySelectorAll('input[type="radio"]').length === 1
            ? radio.parentElement
            : null;

        const clickEl = label || singleParent || radio;
        const rawTxt =
          label?.innerText ||
          singleParent?.innerText ||
          radio.nextSibling?.textContent ||
          radio.getAttribute('aria-label') ||
          radio.value ||
          '';

        return {
          text: rawTxt.replace(/\s+/g, ' ').trim(),
          inputEl: radio,
          clickEl,
        };
      });

      let questionText = '';
      const lca = getLowestCommonAncestor(options.map((o) => o.clickEl));

      if (lca) {
        const prevSib = lca.previousElementSibling;
        if (prevSib && prevSib.querySelectorAll('input[type="radio"]').length === 0) {
          const t = (prevSib.innerText || '').replace(/\s+/g, ' ').trim();
          if (t.length >= 2 && t.length <= 100) {
            questionText = t;
          }
        }

        if (!questionText) {
          const searchRoot =
            lca.parentElement &&
            lca.parentElement.querySelectorAll('input[type="radio"]').length === radios.length
              ? lca.parentElement
              : lca;
          const firstOptEl = options[0].clickEl;
          const candidates = Array.from(
            searchRoot.querySelectorAll('strong, b, h3, h4, h5, dt, legend, p, div, span')
          ).filter((el) => {
            if (el.querySelectorAll('input[type="radio"]').length > 0) return false;
            if (options.some((o) => o.clickEl.contains(el) || el.contains(o.clickEl))) return false;
            const rel = el.compareDocumentPosition(firstOptEl);
            return Boolean(rel & Node.DOCUMENT_POSITION_FOLLOWING);
          });

          for (let i = candidates.length - 1; i >= 0; i--) {
            const t = (candidates[i].innerText || '').replace(/\s+/g, ' ').trim();
            if (t.length >= 2 && t.length <= 100 && t !== '리뷰') {
              questionText = t;
              break;
            }
          }
        }
      }

      groups.push({
        id: groupId++,
        question: questionText,
        options,
      });
    }

    if (groups.length === 0) {
      const customGroups = Array.from(document.querySelectorAll('[role="radiogroup"]')).filter(
        (g) => g.offsetParent !== null
      );
      for (const cg of customGroups) {
        const roleRadios = Array.from(cg.querySelectorAll('[role="radio"]')).filter(
          (r) => r.offsetParent !== null
        );
        if (roleRadios.length < 2) continue;

        const prevSib = cg.previousElementSibling;
        const qText = (
          cg.getAttribute('aria-label') ||
          (prevSib ? prevSib.innerText : '') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim();

        groups.push({
          id: groupId++,
          question: qText,
          options: roleRadios.map((r) => ({
            text: (r.innerText || r.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
            inputEl: null,
            clickEl: r,
          })),
        });
      }
    }

    return groups;
  }

  // 1차 로컬 긍정 키워드 규칙 판별 (확실하면 인덱스 반환, 애매하면 null 반환하여 AI에 위임)
  function pickPositiveOptionLocally(question, optionTexts) {
    const q = (question || '').replace(/\s+/g, '');
    const opts = optionTexts.map((t) => (t || '').trim());
    if (opts.length === 0) return 0;

    const NEGATIVE_RE =
      /(별로|부실|불편|아쉬|아쉽|나빠|나쁨|약해|약함|떨어|부족|느려|느림|시끄|비싸|어려|힘들|실망|최악|비추|안\s*좋|안\s*맞|안\s*돼|안\s*되|잘\s*안|못\s*해|않아|없어)/;
    const NEUTRAL_RE = /^(보통이에요|보통입니다|보통|그저\s*그래요|그저\s*그래|무난해요|무난합니다)$/;

    // 1. 사이즈/핏/색상/설명 일치 관련 100% 긍정 표현
    const exactFitIdx = opts.findIndex(
      (o) =>
        /(정사이즈|딱\s*맞|잘\s*맞|화면과\s*같|사진과\s*같|설명과\s*같|예상과\s*같)/.test(o) &&
        !NEGATIVE_RE.test(o)
    );
    if (exactFitIdx !== -1) return exactFitIdx;

    // 2. 사이즈/크기/길이/기장/발볼/두께/품/핏 질문에서 '적당해요'가 있는 경우
    if (/(사이즈|크기|길이|기장|발볼|두께|품|핏)/.test(q)) {
      const moderateIdx = opts.findIndex((o) => /^적당(해요|합니다|한\s*편이에요)$/.test(o));
      if (moderateIdx !== -1) return moderateIdx;
    }

    // 3. 명확한 긍정 키워드 매칭
    const STRONG_POSITIVE_RE =
      /(아주\s*만족|매우\s*만족|만족해요|만족스러|만족합니다|마음에\s*들|맘에\s*들|아주\s*좋|매우\s*좋|좋아요|좋았|최고|추천해|강추|훌륭|완벽|우수|뛰어나|견고|튼튼|편해|편리|깔끔|깨끗|선명|뚜렷|신선|맛있|부드러|촉촉|산뜻|상쾌|조용|빠르|빨라|쉬워|간편|넉넉|풍성|풍부|잘\s*되|잘\s*돼|잘\s*지워|잘\s*닦|잘\s*발려|잘\s*스며|잘\s*잡아|잘\s*고정|효과\s*좋|효과가\s*있|도움이\s*돼|도움\s*되|가성비\s*좋|고급스|예뻐|이뻐|귀여)/;

    const positiveIndices = [];
    opts.forEach((o, idx) => {
      if (!NEUTRAL_RE.test(o) && !NEGATIVE_RE.test(o) && STRONG_POSITIVE_RE.test(o)) {
        positiveIndices.push(idx);
      }
    });

    if (positiveIndices.length === 1) {
      return positiveIndices[0];
    }

    return null;
  }

  // AI 호출 실패/한도초과 시 안전 폴백 선택
  function pickFallbackOptionLocally(optionTexts) {
    const opts = optionTexts.map((t) => (t || '').trim());
    const NEGATIVE_RE =
      /(별로|부실|불편|아쉬|아쉽|나빠|나쁨|약해|약함|떨어|부족|느려|느림|시끄|비싸|어려|힘들|실망|최악|비추|안\s*좋|안\s*맞|안\s*돼|안\s*되|잘\s*안|못\s*해)/;
    const NEUTRAL_RE = /^(보통이에요|보통입니다|보통|그저\s*그래요|그저\s*그래)$/;

    const moderateIdx = opts.findIndex((o) => /적당/.test(o) && !NEGATIVE_RE.test(o));
    if (moderateIdx !== -1) return moderateIdx;

    const nonNegIdx = opts.findIndex((o) => !NEGATIVE_RE.test(o) && !NEUTRAL_RE.test(o));
    return nonNegIdx !== -1 ? nonNegIdx : 0;
  }

  // 라디오 옵션 단일 클릭 및 checked 상태 보장
  function selectRadioOption(opt) {
    if (!opt) return;
    const { inputEl, clickEl } = opt;

    if (clickEl && clickEl.scrollIntoView) {
      clickEl.scrollIntoView({ block: 'center', behavior: 'instant' });
    }

    if (clickEl && clickEl !== inputEl) {
      triggerClick(clickEl);
    }
    if (inputEl && !inputEl.checked) {
      triggerClick(inputEl);
    }
    if (inputEl && !inputEl.checked) {
      const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'checked'
      )?.set;
      if (nativeCheckedSetter) {
        nativeCheckedSetter.call(inputEl, true);
      } else {
        inputEl.checked = true;
      }
      inputEl.dispatchEvent(new Event('click', { bubbles: true }));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // 모든 객관식 라디오 문항 긍정 선택 수행
  async function handleSurveyRadioButtons(task) {
    const groups = extractSurveyRadioGroups();
    if (groups.length === 0) return;

    const chosenMap = new Map();
    const ambiguousPayload = [];

    for (const g of groups) {
      const optTexts = g.options.map((o) => o.text);
      const localIdx = pickPositiveOptionLocally(g.question, optTexts);
      if (localIdx !== null && localIdx >= 0 && localIdx < g.options.length) {
        chosenMap.set(g.id, localIdx);
      } else {
        ambiguousPayload.push({
          id: g.id,
          question: g.question,
          options: optTexts,
        });
      }
    }

    if (ambiguousPayload.length > 0) {
      await reportProgress(`설문 라디오 항목 AI 판단 중 (${ambiguousPayload.length}문항)...`);
      try {
        const aiRes = await chrome.runtime.sendMessage({
          type: 'ASK_AI_SURVEY_OPTIONS',
          productName: task.productName || '',
          questions: ambiguousPayload,
        });
        const selections = aiRes?.selections || {};
        for (const q of ambiguousPayload) {
          const aiIdx = Number(selections[q.id]);
          if (aiRes?.success && Number.isInteger(aiIdx) && aiIdx >= 0 && aiIdx < q.options.length) {
            chosenMap.set(q.id, aiIdx);
          } else {
            chosenMap.set(q.id, pickFallbackOptionLocally(q.options));
          }
        }
      } catch {
        for (const q of ambiguousPayload) {
          chosenMap.set(q.id, pickFallbackOptionLocally(q.options));
        }
      }
    }

    await reportProgress(`객관식 리뷰 항목(${groups.length}개) 긍정 선택 중...`);
    for (const g of groups) {
      const targetIdx = chosenMap.get(g.id) ?? 0;
      const targetOpt = g.options[targetIdx] || g.options[0];
      selectRadioOption(targetOpt);
      await sleep(160);
    }
  }

  // 확인 모달 팝업의 [확인] 버튼 정밀 탐색 헬퍼 (푸터/헤더 잘못 클릭 원천 방지)
  function findActiveConfirmButtons(excludeEl) {
    const allLayers = Array.from(
      document.querySelectorAll(
        'div, section, article, [role="dialog"], [class*="modal"], [class*="popup"], [class*="dialog"], [class*="layer"], [class*="alert"]'
      )
    ).filter((box) => {
      if (box.offsetParent === null) return false;
      const t = box.innerText || '';
      return (
        t.includes('등록되었습니다') ||
        t.includes('도움이 될 거예요') ||
        t.includes('감사합니다') ||
        t.includes('상품평을 작성') ||
        t.includes('이미 작성')
      );
    });

    for (const box of allLayers) {
      const candidates = Array.from(
        box.querySelectorAll('button, a, input[type="button"], div[role="button"], span, em')
      ).filter((el) => {
        if (el === excludeEl || el.offsetParent === null) return false;
        const txt = (el.innerText || el.value || '').trim();
        return txt === '확인';
      });

      if (candidates.length > 0) {
        return candidates;
      }
    }

    const exactConfirms = Array.from(
      document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')
    ).filter((el) => {
      if (el === excludeEl || el.offsetParent === null) return false;
      if (el.closest('footer, header, nav, #footer, .footer, #header, .gnb')) return false;
      const txt = (el.innerText || el.value || '').trim();
      return txt === '확인';
    });

    return exactConfirms;
  }

  // [Stage 2] 상품 품질 리뷰 폼 작성 (별점 5점 + 객관식 라디오 긍정 선택 + 리뷰타입별 상세리뷰 + 등록하기 클릭)
  async function executeFillFormStage(task) {
    if (hasClickedSubmitOnThisPage) {
      console.log('[쿠팡매니저] 이미 등록하기가 실행되었습니다.');
      return;
    }

    await reportProgress('리뷰 작성 폼 로딩 대기 중...');

    // 최대 10초 동안 폼([등록하기] 버튼) 등장 대기
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

    if (submitBtn.dataset.cpSubmitted === 'true') {
      console.log('[쿠팡매니저] 버튼이 이미 제출 처리되었습니다.');
      return;
    }

    // 1. 별점 5점 클릭
    await reportProgress('별점 5점 선택 중...');
    await sleep(300);
    clickFiveStarRating();
    await sleep(450);

    // 2. 객관식 라디오버튼(설문 항목) 긍정 선택 — (빈)텍스트 및 (빈)별점 타입 모두 적용
    await handleSurveyRadioButtons(task);
    await sleep(300);

    // 3. 상세 리뷰 입력 (별점 전용이 아닌 경우)
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
      await reportProgress('별점 전용 타입: 상세 텍스트 없이 등록합니다...');
      await sleep(250);
    }

    // [합의 사항] 한줄 요약 칸은 입력하지 않고 빈칸 유지!

    // 제출 직전 다음 단계(CAPTURE_WROTE_REVIEW)로 상태 잠금 및 중복 클릭 원천 차단
    const nextTask = { ...task, stage: 'CAPTURE_WROTE_REVIEW' };
    await chrome.storage.local.set({ activeReviewTask: nextTask });

    hasClickedSubmitOnThisPage = true;
    submitBtn.dataset.cpSubmitted = 'true';
    submitBtn.style.pointerEvents = 'none';

    try {
      await chrome.runtime.sendMessage({ type: 'ENSURE_ALERT_OVERRIDE' });
    } catch (_) {}

    await sleep(250);

    await reportProgress('리뷰 [등록하기] 클릭...');
    submitBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(150);

    if (typeof submitBtn.click === 'function') {
      submitBtn.click();
    }
    try {
      submitBtn.disabled = true;
    } catch (_) {}

    await reportProgress('등록 확인 팝업 대기 중...');

    let confirmClicks = 0;
    let lastActionTime = Date.now();

    for (let c = 0; c < 35; c++) {
      await sleep(350);

      if (
        location.href.includes('wroteReviews') ||
        document.querySelector('li.my-review__wrote__list, li.my-review__wrote_list')
      ) {
        break;
      }

      const confirmButtons = findActiveConfirmButtons(submitBtn);

      if (confirmButtons.length > 0) {
        confirmClicks++;
        lastActionTime = Date.now();
        const targetBtn = confirmButtons[0];
        const btnText = (targetBtn.innerText || targetBtn.value || '').trim();
        await reportProgress(`알림 팝업 [${btnText || '확인'}] 클릭 (${confirmClicks}회)...`);
        await sleep(150);
        triggerClick(targetBtn);
        await sleep(400);
        continue;
      }

      if ((confirmClicks > 0 || lastInterceptedAlert) && Date.now() - lastActionTime > 1500 && location.href.includes('register')) {
        await reportProgress('확인 완료! [작성한 리뷰] 페이지로 자동 이동합니다...');
        location.href = 'https://my.coupang.com/productreview/wroteReviews';
        return;
      }
    }

    if (location.href.includes('register')) {
      await reportProgress('[작성한 리뷰] 페이지로 이동합니다...');
      location.href = 'https://my.coupang.com/productreview/wroteReviews';
      return;
    }

    await sleep(600);
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
      const confirmBtns = findActiveConfirmButtons();
      if (confirmBtns.length > 0 && !document.querySelector('li.my-review__wrote__list, li.my-review__wrote_list')) {
        triggerClick(confirmBtns[0]);
        await sleep(400);
      }

      targetLi = document.querySelector(
        'li.my-review__wrote__list, li.my-review__wrote_list, li[class*="my-review__wrote"]'
      );

      if (targetLi && targetLi.offsetParent !== null) {
        break;
      }

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

    targetLi.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    hideBanner();
    await sleep(350);

    const rect = targetLi.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

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
        purchaseDate: task.purchaseDate,
        chatRoomName: task.chatRoomName,
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
