/**
 * R-037 — client-side referral-code plumbing.
 *
 * Flow: a referred visitor lands on ANY page with `?ref=CODE`. We
 * stash the code in localStorage (visitors rarely sign up on the
 * first pageview) and attach it to the register call whenever that
 * happens — minutes or days later. Cleared after a successful signup
 * so it can't leak onto a second account from the same browser.
 *
 * Pure functions + injectable storage so the test harness can run
 * them without jsdom.
 */

const KEY = 'rb_pending_referral_code';
const MAX_CODE_LENGTH = 20;
const CODE_SHAPE = /^[a-z0-9]+$/i;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* private mode */
  }
  return null;
}

/** Sanitise an incoming ?ref= value. Returns '' for anything dodgy. */
export function sanitizeReferralCode(raw: string | null | undefined): string {
  const code = String(raw || '').trim();
  if (!code || code.length > MAX_CODE_LENGTH) return '';
  if (!CODE_SHAPE.test(code)) return '';
  return code.toLowerCase();
}

/** Stash a code from the URL. No-op for invalid codes. */
export function storePendingReferralCode(raw: string | null | undefined, storage?: StorageLike): boolean {
  const code = sanitizeReferralCode(raw);
  const target = resolveStorage(storage);
  if (!code || !target) return false;
  try {
    target.setItem(KEY, code);
    return true;
  } catch {
    return false;
  }
}

/** Read the stashed code (register flow). */
export function readPendingReferralCode(storage?: StorageLike): string {
  const target = resolveStorage(storage);
  if (!target) return '';
  try {
    return sanitizeReferralCode(target.getItem(KEY));
  } catch {
    return '';
  }
}

/** Clear after successful signup so the code can't double-apply. */
export function clearPendingReferralCode(storage?: StorageLike): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
