/**
 * Builds the `mailto:` URL the editor surfaces when a resume
 * download fails. The link pre-fills the support inbox with every
 * piece of context an operator needs to regenerate the resume via
 * the admin Force-Export route:
 *
 *   - the user's account email (so admin can confirm identity)
 *   - the resume id (Force-Export's required input)
 *   - the payment id if known (to confirm capture)
 *   - the original error message (to triage)
 *
 * Pure module — no React, no DOM — so the helper can be tested
 * directly and reused from any failure surface.
 *
 * Privacy: the body is built client-side and opens the user's local
 * mail client. We never send anything to our server here; the user
 * decides what to actually email.
 */

export interface DownloadHelpInput {
  /** Where the support team reads mail. */
  supportEmail: string;
  /** Resume id the failed download was for. */
  resumeId: string;
  /** Best-effort user email — falls back to '(not signed in)'. */
  userEmail?: string;
  /** Best-effort payment id if the failure happened after capture. */
  paymentId?: string;
  /** Short human-readable error string from the failure. */
  errorMessage?: string;
  /** Optional plan tier for triage ("FREE" / "STUDENT" / "PRO"). */
  plan?: string;
}

const SUBJECT = 'Resume export failed';

/**
 * Returns a `mailto:` URL with `subject` and `body` properly
 * URI-encoded. Returns '' if the support email itself is missing,
 * so callers can render a non-clickable fallback in that case.
 */
export function buildDownloadHelpMailto(input: DownloadHelpInput): string {
  const supportEmail = String(input.supportEmail || '').trim();
  if (!supportEmail) return '';

  const lines = [
    'Hi,',
    '',
    'My resume export failed. Could you regenerate and email it to me?',
    '',
    `Account email: ${(input.userEmail || '').trim() || '(not signed in)'}`,
    `Plan:          ${(input.plan || '').trim() || '(unknown)'}`,
    `Resume id:     ${(input.resumeId || '').trim() || '(not provided)'}`,
    `Payment id:    ${(input.paymentId || '').trim() || '(none / failed before capture)'}`,
    '',
    `Error shown to me:`,
    `${(input.errorMessage || '(no message)').trim()}`,
    '',
    'Thanks!',
  ];
  const body = lines.join('\n');
  return `mailto:${supportEmail}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`;
}

/**
 * Short user-facing label for the callout button. Lives here so the
 * label and the URL builder cannot drift independently.
 */
export const DOWNLOAD_HELP_BUTTON_LABEL = 'Get help — email a screenshot to support';
