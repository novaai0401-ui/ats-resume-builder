import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * R-087 — optional WhatsApp channel (Meta WhatsApp Cloud API).
 *
 * India users live on WhatsApp, so job-alert digests and outcome nudges
 * get an ADDITIVE WhatsApp copy there. Non-negotiables:
 *
 *   - Fully env-gated: without WHATSAPP_ACCESS_TOKEN +
 *     WHATSAPP_PHONE_NUMBER_ID the service is a silent no-op and the app
 *     behaves exactly as before.
 *   - Never fails the main path: sendTemplate() NEVER throws — callers
 *     (email nudge / alert digest) must not be delayed or broken by a
 *     WhatsApp outage. Returns { ok, error } instead.
 *   - Template-only: Meta requires pre-approved template messages for
 *     business-initiated sends, so there are no free-text session sends.
 *   - The access token is never logged and never appears in getStatus().
 */

/**
 * Normalize a stored phone to the Cloud API's expected format: E.164
 * digits WITHOUT the leading '+'. Users store '+91xxxxxxxxxx', '91xx…',
 * '0xxxxxxxxxx' or numbers with spaces/dashes. Returns '' when the
 * result is not a plausible phone (too short/long) so callers can skip.
 */
export function normalizeWhatsappPhone(raw: string, defaultCountryCode = '91'): string {
  let digits = String(raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  // A national-format Indian number: '0' trunk prefix + 10 digits.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1);
  } else if (digits.length === 10) {
    // Bare 10-digit local number — assume the default country code.
    digits = defaultCountryCode + digits;
  }
  // E.164 is 8–15 digits including country code.
  if (digits.length < 8 || digits.length > 15) return '';
  return digits;
}

/** Mask an ID so ops can eyeball it without it being copy-pasteable. */
function maskId(value: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.length <= 4) return '*'.repeat(v.length);
  return `${'*'.repeat(v.length - 4)}${v.slice(-4)}`;
}

/** Structured, log/endpoint-friendly view of the WhatsApp config (no secrets). */
export type WhatsappConfigStatus = {
  configured: boolean;
  apiVersion: string;
  templateLanguage: string;
  /** Masked phone-number ID so support can verify it without leaking it. */
  maskedPhoneNumberId: string;
  /** Human-readable reason when not configured (empty when configured). */
  reason: string;
};

const SEND_TIMEOUT_MS = 10_000;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  private readonly templateLanguage: string;
  private readonly status: WhatsappConfigStatus;

  constructor(private readonly config: ConfigService) {
    this.accessToken = String(this.config.get('WHATSAPP_ACCESS_TOKEN', '') || '').trim();
    this.phoneNumberId = String(this.config.get('WHATSAPP_PHONE_NUMBER_ID', '') || '').trim();
    this.apiVersion = String(this.config.get('WHATSAPP_API_VERSION', 'v21.0') || 'v21.0').trim();
    this.templateLanguage = String(this.config.get('WHATSAPP_TEMPLATE_LANG', 'en') || 'en').trim();

    // Precise reason so ops see EXACTLY what's missing (mail.service pattern).
    const missing: string[] = [];
    if (!this.accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
    if (!this.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    const reason = missing.length ? `Missing env: ${missing.join(', ')}.` : '';

    this.status = {
      configured: !reason,
      apiVersion: this.apiVersion,
      templateLanguage: this.templateLanguage,
      maskedPhoneNumberId: maskId(this.phoneNumberId),
      reason,
    };

    if (this.status.configured) {
      this.logger.log(
        `WhatsApp service configured (apiVersion=${this.apiVersion}, phoneNumberId=${this.status.maskedPhoneNumberId})`,
      );
    }
    // Unconfigured is the normal state for most deploys — stay silent
    // (no warn spam): the channel is optional by design.
  }

  isConfigured(): boolean {
    return this.status.configured;
  }

  /** Snapshot of the WhatsApp config (no secrets) for the admin diagnostic. */
  getStatus(): WhatsappConfigStatus {
    return { ...this.status };
  }

  /**
   * Send a pre-approved template message via the Cloud API.
   * NEVER throws — a WhatsApp failure must never fail or delay the email
   * path that calls this. Never logs the access token.
   */
  async sendTemplate(
    toE164Phone: string,
    templateName: string,
    bodyParams: string[],
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.status.configured) {
      return { ok: false, error: this.status.reason || 'WhatsApp is not configured.' };
    }
    const to = normalizeWhatsappPhone(toE164Phone);
    if (!to) return { ok: false, error: 'Recipient phone number is not a valid E.164 number.' };
    if (!templateName) return { ok: false, error: 'Template name is required.' };

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: this.templateLanguage },
        components: [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text: String(text ?? '') })),
          },
        ],
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        // Truncate + scrub: Graph errors are verbose and must never echo
        // the token (it lives in the header, but belt-and-braces).
        const safe = detail.replace(this.accessToken, '***').slice(0, 300);
        this.logger.warn(`WhatsApp send failed (template=${templateName}, http=${res.status}): ${safe}`);
        return { ok: false, error: `WhatsApp API returned HTTP ${res.status}.` };
      }
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const safe = msg.replace(this.accessToken, '***');
      this.logger.warn(`WhatsApp send failed (template=${templateName}): ${safe}`);
      return { ok: false, error: safe };
    } finally {
      clearTimeout(timer);
    }
  }
}
