/**
 * Autofill content script — runs on ATS application hosts (Greenhouse,
 * Lever, Workable, SmartRecruiters, Ashby, Workday). It is deliberately
 * conservative:
 *
 *   - It NEVER autofills automatically. It injects a floating
 *     "Autofill with CallbackCV" button and only acts on an explicit click.
 *   - It fills ONLY empty fields (never clobbers user input).
 *   - It never touches password/file/hidden inputs.
 *   - Skipping a field is fine; wrong data is not.
 *
 * The auth token is NOT carried in-page. The profile is fetched through the
 * background service worker (chrome.runtime.sendMessage), which owns the
 * token. Mapping logic lives in the DOM-free `content/field-map.js`
 * (loaded before this script), read off globalThis.CallbackCVFieldMap.
 */

(() => {
  if (window.__callbackcvAutofillInjected) return;
  window.__callbackcvAutofillInjected = true;

  const FieldMap = globalThis.CallbackCVFieldMap;
  if (!FieldMap) {
    console.warn('[CallbackCV] field-map not loaded; autofill disabled.');
    return;
  }

  injectButton();

  function injectButton() {
    const wrap = document.createElement('div');
    wrap.id = 'callbackcv-autofill-fab';
    wrap.style.cssText = [
      'position:fixed', 'right:18px', 'bottom:18px', 'z-index:2147483646',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    ].join(';');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Autofill with CallbackCV';
    btn.style.cssText = [
      'padding:10px 14px', 'background:#0a64dc', 'color:#fff', 'border:0',
      'border-radius:8px', 'cursor:pointer', 'font-weight:600', 'font-size:13px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.2)',
    ].join(';');
    btn.addEventListener('click', () => runAutofill(btn));

    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  async function runAutofill(btn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading…';

    const resp = await sendMessage({ type: 'GET_AUTOFILL_PROFILE' });
    if (!resp || !resp.ok) {
      btn.disabled = false;
      btn.textContent = original;
      const msg = resp && /401|configured|token/i.test(resp.error || '')
        ? 'Connect the extension first (click the extension icon).'
        : `Could not load profile: ${(resp && resp.error) || 'unknown'}`;
      toast(msg, true);
      return;
    }

    const profile = resp.data || {};
    const filled = fillForm(profile);
    btn.disabled = false;
    btn.textContent = original;
    toast(
      filled > 0
        ? `Filled ${filled} field${filled === 1 ? '' : 's'} — please review before submitting.`
        : 'No empty matching fields found to fill.',
      false,
    );
  }

  function fillForm(profile) {
    const controls = document.querySelectorAll('input, textarea, select');
    let count = 0;

    controls.forEach((el) => {
      const type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
      if (['password', 'file', 'hidden', 'checkbox', 'radio', 'submit', 'button', 'image', 'reset'].includes(type)) return;
      if (el.disabled || el.readOnly) return;
      // Only fill EMPTY fields — never clobber user input.
      if (el.value && String(el.value).trim() !== '') return;

      const descriptor = describe(el, type);
      const key = FieldMap.fieldKeyForElement(descriptor);
      if (!key) return;

      const value = FieldMap.fillValueForKey(profile, key);
      if (!value) return;

      if (el.tagName.toLowerCase() === 'select') {
        if (setSelectValue(el, value)) count += 1;
      } else {
        setNativeValue(el, value);
        count += 1;
      }
    });

    return count;
  }

  function describe(el, type) {
    return {
      autocomplete: el.getAttribute('autocomplete') || '',
      name: el.getAttribute('name') || '',
      id: el.getAttribute('id') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      labelText: labelTextFor(el),
      type,
    };
  }

  function labelTextFor(el) {
    // 1. <label for="id">
    if (el.id) {
      const forLabel = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (forLabel && forLabel.textContent) return forLabel.textContent;
    }
    // 2. wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) return parentLabel.textContent;
    // 3. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const texts = labelledBy.split(/\s+/)
        .map((lid) => document.getElementById(lid))
        .filter(Boolean)
        .map((n) => n.textContent || '');
      if (texts.length) return texts.join(' ');
    }
    // 4. placeholder as a weak last resort
    return el.getAttribute('placeholder') || '';
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // React/Vue-friendly value setter: use the native prototype setter so
  // controlled components see the change, then dispatch input + change.
  function setNativeValue(el, value) {
    const proto = el.tagName.toLowerCase() === 'textarea'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setSelectValue(el, value) {
    const want = value.toLowerCase();
    const opt = Array.from(el.options).find(
      (o) => o.value.toLowerCase() === want || (o.textContent || '').trim().toLowerCase() === want,
    );
    if (!opt) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(el, opt.value);
    else el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  let toastEl = null;
  function toast(message, isError) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.textContent = message;
    toastEl.style.cssText = [
      'position:fixed', 'right:18px', 'bottom:70px', 'z-index:2147483647',
      'max-width:320px', 'padding:12px 14px', 'border-radius:8px',
      `background:${isError ? '#8a1f1f' : '#147a3a'}`, 'color:#fff',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'font-size:13px', 'line-height:1.4', 'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
    ].join(';');
    document.body.appendChild(toastEl);
    setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, 6000);
  }

  function sendMessage(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (resp) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(resp || { ok: false, error: 'no response' });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  // Allow the popup to trigger autofill on the active tab.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'TRIGGER_AUTOFILL') {
      const btn = document.querySelector('#callbackcv-autofill-fab button');
      if (btn) runAutofill(btn);
      sendResponse({ ok: true });
    }
    return false;
  });
})();
