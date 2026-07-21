/**
 * Auth-handshake content script (R-093). Matched ONLY on the CallbackCV
 * web app's /extension/connect page. When the user clicks "Connect my
 * extension" on that page, the page hands us the current access token via:
 *
 *   1. window.postMessage({ source:'callbackcv-connect', token, apiBase })
 *   2. a `data-callbackcv-token` attribute on a hidden div (fallback).
 *
 * We verify event.origin matches the page origin and data.source before
 * touching the token, then persist { accessToken, apiBase } into
 * chrome.storage.local. This replaces the old paste-your-JWT flow.
 */

(() => {
  if (window.__callbackcvConnectInjected) return;
  window.__callbackcvConnectInjected = true;

  const PAGE_ORIGIN = window.location.origin;

  window.addEventListener('message', (event) => {
    // Only trust messages from THIS page's own origin.
    if (event.origin !== PAGE_ORIGIN) return;
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'callbackcv-connect') return;
    if (typeof data.token !== 'string' || !data.token) return;
    store(data.token, data.apiBase);
  });

  // Fallback: some content-script/page timing races drop the postMessage.
  // Read the hidden div the page stamps ONLY after the user clicks.
  function tryFallbackSlot() {
    const slot = document.getElementById('callbackcv-token-slot');
    if (!slot) return;
    const token = slot.getAttribute('data-callbackcv-token');
    if (token) store(token, slot.getAttribute('data-callbackcv-apibase') || '');
  }

  const observer = new MutationObserver(() => tryFallbackSlot());
  const startObserving = () => {
    tryFallbackSlot();
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-callbackcv-token'],
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    startObserving();
  }

  let stored = false;
  function store(token, apiBase) {
    if (stored) return; // idempotent — store once per page load
    stored = true;
    const payload = { accessToken: token };
    if (typeof apiBase === 'string' && apiBase) {
      payload.apiBase = apiBase.replace(/\/+$/, '');
    }
    chrome.storage.local.set(payload, () => {
      showConfirmation(Boolean(chrome.runtime.lastError));
    });
  }

  function showConfirmation(failed) {
    const banner = document.createElement('div');
    banner.textContent = failed
      ? 'CallbackCV: could not save the connection. Please retry.'
      : 'CallbackCV extension connected. You can close this tab.';
    banner.style.cssText = [
      'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'padding:12px 18px', 'border-radius:8px',
      `background:${failed ? '#8a1f1f' : '#147a3a'}`, 'color:#fff',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'font-size:14px', 'font-weight:600', 'box-shadow:0 2px 10px rgba(0,0,0,0.25)',
    ].join(';');
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 8000);
  }
})();
