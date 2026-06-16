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
