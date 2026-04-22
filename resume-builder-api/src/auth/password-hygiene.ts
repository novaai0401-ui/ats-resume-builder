import { createHash } from 'node:crypto';

/**
 * Password hygiene helpers.
 *
 * - `assertAcceptablePassword` validates minimal complexity.
 * - `isPasswordBreached` queries the Have I Been Pwned range endpoint using
 *   k-anonymity: we send only the first 5 hex chars of the SHA-1 hash and
 *   compare the suffix locally, so the plaintext never leaves the process.
 *   Ref: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

export const MIN_PASSWORD_LENGTH = 10;

const HIBP_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const REQUEST_TIMEOUT_MS = 3_000;

export function assertAcceptablePassword(password: string): void {
  const trimmed = String(password || '');
  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const classes = [
    /[a-z]/.test(trimmed),
    /[A-Z]/.test(trimmed),
    /\d/.test(trimmed),
    /[^a-zA-Z0-9]/.test(trimmed),
  ].filter(Boolean).length;
  if (classes < 3) {
    throw new Error('Password must contain at least three of: lowercase, uppercase, digit, symbol.');
  }
}

/**
 * Return true if the password is present in the HIBP breach corpus.
 *
 * Fail-open: network errors / timeouts are treated as "not breached" so a
 * transient HIBP outage can't block signups. This matches the industry
 * convention for k-anonymity checks.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  if (!password || (process.env.ENABLE_HIBP_CHECK || '').toLowerCase() === 'false') {
    return false;
  }
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${HIBP_ENDPOINT}${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true', 'User-Agent': 'ats-resume-builder' },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const text = await res.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const [hashSuffix, countRaw] = line.split(':');
      if (!hashSuffix) continue;
      if (hashSuffix.trim().toUpperCase() !== suffix) continue;
      const count = parseInt((countRaw || '').trim(), 10);
      // HIBP pads responses with fake zero-count entries; treat those as
      // "not actually breached" per their API contract.
      return Number.isFinite(count) && count > 0;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Combine complexity and breach checks. Throws a user-friendly message on
 * failure so the caller can rethrow as BadRequestException.
 */
export async function enforcePasswordPolicy(password: string): Promise<void> {
  assertAcceptablePassword(password);
  if (await isPasswordBreached(password)) {
    throw new Error(
      'This password appears in a known data breach. Please choose a different one.',
    );
  }
}
