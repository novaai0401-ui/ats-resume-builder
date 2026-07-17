import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { WhatsappService } from '../notifications/whatsapp.service';

/**
 * R-087 — WhatsApp diagnostics. The channel is optional and silently
 * disabled when unconfigured, so this admin-only surface says EXACTLY
 * where the setup stands: which env var is missing, which message
 * templates are wired, and what to do next. No live send, no secrets.
 */
@SkipThrottle()
@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class WhatsappStatusController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  /** Config snapshot (no secrets) + which templates are enabled. */
  @Get('status')
  status() {
    const status = this.whatsapp.getStatus();
    const nudgeTemplate = String(this.config.get('WHATSAPP_NUDGE_TEMPLATE', '') || '').trim();
    const alertTemplate = String(this.config.get('WHATSAPP_ALERT_TEMPLATE', '') || '').trim();
    return {
      ...status,
      templates: {
        // Template names are not secrets — showing them lets ops match
        // against what's approved in the Meta Business dashboard.
        nudge: nudgeTemplate || null,
        alert: alertTemplate || null,
      },
      hint: buildHint(status.configured, status.reason, nudgeTemplate, alertTemplate),
    };
  }
}

function buildHint(configured: boolean, reason: string, nudgeTemplate: string, alertTemplate: string): string {
  if (!configured) {
    return `${reason} Register: create a Meta Business app → add the WhatsApp product → get a permanent access token + the sender's Phone Number ID → set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the environment.`;
  }
  if (!nudgeTemplate && !alertTemplate) {
    return 'WhatsApp is configured but no message template is wired — approve templates in the Meta Business dashboard, then set WHATSAPP_NUDGE_TEMPLATE and/or WHATSAPP_ALERT_TEMPLATE to their names.';
  }
  return 'WhatsApp is configured. Users with a phone number on file will get the enabled template messages alongside email.';
}
