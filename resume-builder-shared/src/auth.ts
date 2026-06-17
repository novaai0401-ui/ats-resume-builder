/**
 * Auth validation constants + helpers shared by the API, web, and mobile
 * clients so the password policy and email checks never drift between the
 * input hints, client-side validation, and the server's enforcement.
 */

/** Minimum password length enforced server-side (password-hygiene). */
export const MIN_PASSWORD_LENGTH = 10;

/** Short hint shown in password inputs. Keep in sync with MIN_PASSWORD_LENGTH. */
export const PASSWORD_MIN_HINT = `Min ${MIN_PASSWORD_LENGTH} characters`;

/** User-facing message when a password is too short. */
export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;

/**
 * Pragmatic email check: one @, a non-empty local part, and a domain with at
 * least one dot and a 2+ char TLD (so "name.health", "name@host", and trailing
 * dots are rejected, while name@example.com / .in / .co.in pass).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function isValidEmail(value?: string | null): boolean {
  return EMAIL_RE.test(String(value || '').trim());
}

/** Clear, actionable message for an invalid email (better than the native tooltip). */
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address, e.g. you@example.com.';

/**
 * Pragmatic phone check for resume contact + signup. Accepts:
 *  - E.164 with a country code: "+" then 8–15 digits (e.g. +919876543210)
 *  - a local 10-digit number (e.g. 9876543210)
 *  - a local number with a trunk 0 (e.g. 09876543210)
 * Rejects garbage like "173537282727" (12 digits, no country-code "+").
 * Separators (spaces, dashes, dots, parens) are ignored before checking.
 */
export function isValidPhone(value?: string | null): boolean {
  const cleaned = String(value || '').trim().replace(/[\s().-]/g, '');
  if (!cleaned) return false;
  if (/^\+\d{8,15}$/.test(cleaned)) return true;
  if (/^0\d{10}$/.test(cleaned)) return true;
  if (/^\d{10}$/.test(cleaned)) return true;
  return false;
}

/** Clear, actionable message for an invalid phone number. */
export const PHONE_INVALID_MESSAGE =
  'Enter a valid phone number — 10 digits, or include your country code with a + (e.g. +91 98765 43210).';

/**
 * Build a clean E.164 string from a phone-input change payload (TkxPhoneInput
 * shape). The widget builds `e164 = +{dial}{digits}`, so when a user types a
 * number that ALREADY includes a country code (e.g. "+919876543210") it doubles
 * the dial code → "+91919876543210". When the user clearly typed a full
 * international number (leading "+"), we trust their digits instead of the
 * widget's doubled value. Otherwise we keep the widget's E.164.
 */
export function normalizeE164FromPayload(payload?: {
  raw?: string | null;
  e164?: string | null;
  digits?: string | null;
  country?: { dial?: string | null; length?: number | [number, number] | null } | null;
}): string {
  const dial = String(payload?.country?.dial || '').replace(/\D/g, '');
  let digits = String(payload?.digits || '').replace(/\D/g, '');

  // Fast path: the user clearly typed a full international number.
  const raw = String(payload?.raw || '').trim();
  if (raw.startsWith('+')) {
    const d = raw.replace(/\D/g, '');
    return d ? `+${d}` : '';
  }

  // The widget often strips the leading "+", so detect a doubled country code
  // by length: if the national digits already start with the dial code AND the
  // total exceeds the country's national length, the dial code was entered
  // twice — drop the duplicate. (A genuine national number that merely starts
  // with the same digits stays within the national length, so it's untouched.)
  const lenSpec = payload?.country?.length;
  const maxNational = Array.isArray(lenSpec) ? lenSpec[1] : (typeof lenSpec === 'number' ? lenSpec : 0);
  if (dial && digits.startsWith(dial) && maxNational && digits.length > maxNational) {
    digits = digits.slice(dial.length);
  }

  if (!digits) {
    const e164 = String(payload?.e164 || '').trim();
    return e164;
  }
  return dial ? `+${dial}${digits}` : `+${digits}`;
}
