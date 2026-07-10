import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { MailService } from '../mail/mail.service';

/**
 * R-079 — mail diagnostics. Email delivery was failing silently ("Email
 * delivery is not configured. Contact support."). This admin-only surface
 * says EXACTLY why: which env var is missing/placeholder, whether the live
 * SMTP handshake succeeds, and lets an admin send a real test email — so
 * ops can fix the Render env without guessing.
 */
@SkipThrottle()
@Controller('admin/mail')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class MailStatusController {
  constructor(private readonly mail: MailService) {}

  /** Config snapshot (no secrets) + a live SMTP verify. */
  @Get('status')
  async status() {
    const status = this.mail.getStatus();
    const verify = await this.mail.verifyConnection();
    return {
      ...status,
      // The handshake result: even a "configured" server can fail auth
      // (e.g. a Gmail password instead of an App Password).
      smtpReachable: verify.ok,
      smtpError: verify.error || null,
      hint: buildHint(status.configured, status.reason, verify.ok, verify.error),
    };
  }

  /** Send a real test email to prove end-to-end delivery. */
  @Post('test')
  async test(@Body() body: { to?: string }) {
    const to = String(body?.to || '').trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      throw new BadRequestException('Provide a valid "to" email address.');
    }
    const result = await this.mail.sendTestEmail(to);
    return { sent: result.ok, to, error: result.error || null };
  }
}

function buildHint(configured: boolean, reason: string, reachable: boolean, error?: string): string {
  if (!configured) {
    return `${reason} Set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM in the environment. For Gmail: host smtp.gmail.com, port 587, user your Gmail address, pass a 16-char App Password (not your login password).`;
  }
  if (!reachable) {
    if (/invalid login|username and password not accepted|auth/i.test(error || '')) {
      return 'SMTP auth failed. For Gmail you MUST use an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password.';
    }
    if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(error || '')) {
      return 'Could not reach the SMTP server. Check SMTP_HOST/SMTP_PORT and that the host allows outbound SMTP (try port 587 with SMTP_SECURE=false, or 465 with SMTP_SECURE=true).';
    }
    return 'SMTP is configured but the handshake failed — see smtpError.';
  }
  return 'Email is configured and the SMTP handshake succeeded. Use POST /admin/mail/test to send a real message.';
}
