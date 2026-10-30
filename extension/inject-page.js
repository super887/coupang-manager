// inject-page.js (MAIN World: 쿠팡 웹페이지 본래 컨텍스트에서 실행)
// 쿠팡의 native window.alert 및 window.confirm을 가로채어 블로킹 없이 자동 승인 처리
(function () {
  if (window.__COUPANG_ALERT_INTERCEPTOR__) return;
  window.__COUPANG_ALERT_INTERCEPTOR__ = true;

  const originalAlert = window.alert;
  const originalConfirm = window.confirm;

  // alert 자동 가로채기 & 확인 처리
  window.alert = function (message) {
    const msgStr = String(message || '');
    console.log('[쿠팡매니저 MAIN] window.alert 자동 수락 처리:', msgStr);
    try {
      window.dispatchEvent(
        new CustomEvent('__COUPANG_MANAGER_ALERT__', {
          detail: { type: 'alert', message: msgStr, time: Date.now() },
        })
      );
    } catch (_) {}
    // 사용자에게 팝업을 띄우며 블로킹하지 않고 즉시 true 반환하여 다음 코드/리다이렉트가 바로 실행되게 함
    return true;
  };

  // confirm 자동 가로채기 & 승인 처리
  window.confirm = function (message) {
    const msgStr = String(message || '');
    console.log('[쿠팡매니저 MAIN] window.confirm 자동 승인 처리:', msgStr);
    try {
      window.dispatchEvent(
        new CustomEvent('__COUPANG_MANAGER_ALERT__', {
          detail: { type: 'confirm', message: msgStr, time: Date.now() },
        })
      );
    } catch (_) {}
    return true;
  };
})();
