// inject-page.js (MAIN World: 쿠팡 웹페이지 본래 컨텍스트에서 실행)
// 쿠팡의 native window.alert 및 window.confirm을 가로채어 블로킹 없이 자동 승인 처리

(function () {
  function hookWindow(win) {
    if (!win) return;
    try {
      if (win.__COUPANG_ALERT_OVERRIDDEN__) return;
      win.__COUPANG_ALERT_OVERRIDDEN__ = true;

      // alert 자동 가로채기 & 승인
      win.alert = function (message) {
        const msgStr = String(message || '');
        console.log('[쿠팡매니저 MAIN] alert 자동 수락 처리:', msgStr);
        try {
          window.dispatchEvent(
            new CustomEvent('__COUPANG_MANAGER_ALERT__', {
              detail: { type: 'alert', message: msgStr, time: Date.now() },
            })
          );
        } catch (_) {}
        // 알림창 띄우지 않고 즉시 리턴
        return true;
      };

      // confirm 자동 가로채기 & 승인
      win.confirm = function (message) {
        const msgStr = String(message || '');
        console.log('[쿠팡매니저 MAIN] confirm 자동 승인 처리:', msgStr);
        try {
          window.dispatchEvent(
            new CustomEvent('__COUPANG_MANAGER_ALERT__', {
              detail: { type: 'confirm', message: msgStr, time: Date.now() },
            })
          );
        } catch (_) {}
        return true;
      };
    } catch (_) {}
  }

  // 1. 현재 윈도우 및 상위 윈도우 후킹
  hookWindow(window);
  if (window.top && window.top !== window) {
    hookWindow(window.top);
  }
  if (window.parent && window.parent !== window) {
    hookWindow(window.parent);
  }

  // 2. 동적으로 생성되는 iframe 후킹
  try {
    const origAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function (child) {
      const res = origAppend.apply(this, arguments);
      if (child && (child.tagName === 'IFRAME' || child.nodeName === 'IFRAME')) {
        try {
          hookWindow(child.contentWindow);
          child.addEventListener('load', () => hookWindow(child.contentWindow));
        } catch (_) {}
      }
      return res;
    };
  } catch (_) {}
})();
