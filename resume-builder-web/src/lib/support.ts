/**
 * Single source of truth for user-facing support contact.
 *
 * Surfaces that MUST show this address (founder requirement):
 *  - any unexpected application error (global error boundary),
 *  - payment succeeded but the download failed / wrong file downloaded
 *    (DownloadChargeModal + post-payment export path),
 *  - the billing page, for money questions.
 */
export const SUPPORT_EMAIL = 'novaai0401@gmail.com';

/** Prefilled mailto link so the user lands in a composed email. */
export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
