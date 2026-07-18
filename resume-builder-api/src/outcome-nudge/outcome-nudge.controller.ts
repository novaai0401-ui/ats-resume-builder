import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  Body,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OutcomeNudgeService, type NudgeAction } from './outcome-nudge.service';
import { InboundMailService } from './inbound-mail.service';

const VALID_ACTIONS = new Set(['no_reply', 'rejected', 'interview', 'unsubscribe']);

/**
 * R-031 endpoints.
 *
 * POST /outcome-nudge/run
 *   Cron entry point. Guarded by CRON_SECRET (header `x-cron-secret`)
 *   — NOT by JWT, because the caller is Render's Cron Job runner, not
 *   a user. Refuses to run when the secret is unset so a misconfigured
 *   deploy cannot be triggered by anyone.
 *
 * GET /outcome-nudge/:token/:action
 *   The one-tap links from the email land here. Unauthenticated —
 *   the single-use token is the authorization. Responds with a tiny
 *   self-contained HTML confirmation (the user is in a mail client's
 *   in-app browser; bouncing them through the SPA login would defeat
 *   the one-tap promise).
 */
@Controller('outcome-nudge')
export class OutcomeNudgeController {
  constructor(
    private readonly service: OutcomeNudgeService,
    private readonly inboundMail: InboundMailService,
  ) {}

  @Post('run')
  @HttpCode(200)
  async run(@Req() req: Request) {
    const configured = String(process.env.CRON_SECRET || '').trim();
    const provided = String(req.headers['x-cron-secret'] || '').trim();
    if (!configured || provided !== configured) {
      throw new ForbiddenException('Invalid cron secret.');
    }
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || 'localhost:4001';
    const nudges = await this.service.runNudgeScan(`${proto}://${host}`);
    // R-032: the same daily cron purges expired inbound-mail audit
    // rows (30-day retention) — one schedule for all outcome jobs.
    const purgedInboundMail = await this.inboundMail.purgeExpired();
    return { ...nudges, purgedInboundMail };
  }

  @Get(':token/:action')
  async act(
    @Param('token') token: string,
    @Param('action') action: string,
    @Res() res: Response,
  ) {
    if (!VALID_ACTIONS.has(action)) {
      res.status(404).send(confirmationHtml('This link is not valid.', false));
      return;
    }
    try {
      const outcome = await this.service.applyAction(token, action as NudgeAction | 'unsubscribe');
      if (outcome.result === 'unsubscribed') {
        res.send(confirmationHtml(
          'You will no longer receive outcome check-in emails. You can re-enable them anytime from Settings.',
          true,
        ));
        return;
      }
      const messages: Record<string, string> = {
        no_reply: `Noted — no reply yet from ${outcome.company}. We'll resurface this application in your tracker in 7 days.`,
        rejected: `Recorded: ${outcome.company} (${outcome.role}) marked as rejected. Sorry about this one — your tracker and outcome stats are updated.`,
        interview: `Recorded: interview at ${outcome.company}! Your tracker is updated. Good luck — Interview Prep is ready when you are.`,
      };
      res.send(confirmationHtml(messages[outcome.action] || 'Recorded. Thank you!', true));
    } catch {
      res.status(404).send(confirmationHtml(
        'This link has expired or was already used. You can update the application directly from your tracker.',
        false,
      ));
    }
  }
}

/**
 * R-032 webhook. Inbound-mail providers (SendGrid Inbound Parse,
 * Mailgun Routes, Cloudflare Email Workers) POST the parsed message
 * here when a user forwards an email to track@tekivex.com.
 *
 * Guarded by INBOUND_MAIL_SECRET as a query param — providers can't
 * set custom headers, but they CAN post to a URL with a secret in it:
 *   POST /outcome-mail/inbound?secret=<INBOUND_MAIL_SECRET>
 * Refuses (404, no oracle) when the env var is unset.
 *
 * Field mapping is provider-tolerant: SendGrid posts `from`/`subject`/
 * `text`; Mailgun posts `sender`/`subject`/`body-plain`. We read both.
 */
@Controller('outcome-mail')
export class InboundOutcomeMailController {
  constructor(private readonly inboundMail: InboundMailService) {}

  @Post('inbound')
  @HttpCode(200)
  async inbound(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const configured = String(process.env.INBOUND_MAIL_SECRET || '').trim();
    const provided = String((req.query?.secret as string) || '').trim();
    if (!configured || provided !== configured) {
      throw new ForbiddenException('Not available.');
    }
    const b = body || {};
    return this.inboundMail.handleInbound({
      fromEmail: String(b['from'] ?? b['sender'] ?? ''),
      subject: String(b['subject'] ?? ''),
      text: String(b['text'] ?? b['body-plain'] ?? b['body'] ?? ''),
    });
  }
}

/**
 * Self-contained confirmation page — zero JS, inline CSS only, loads
 * instantly inside mail-client webviews. Links back to the app for
 * users who want to do more.
 */
function confirmationHtml(message: string, ok: boolean): string {
  const color = ok ? '#1e7a3a' : '#b91c1c';
  const title = ok ? 'Done' : 'Link not valid';
  // APP_WEB_URL is the canonical web origin (already used by /download
  // and the release manifest). Fallback keeps dev usable.
  const webUrl = String(process.env.APP_WEB_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title} · CallbackCV</title>
</head>
<body style="margin:0;background:#f3f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:48px auto;padding:32px;background:#ffffff;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,0.08);text-align:center;">
    <div style="font-size:40px;line-height:1;margin-bottom:12px;">${ok ? '✓' : '✗'}</div>
    <h1 style="margin:0 0 10px;font-size:20px;color:${color};">${title}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#334155;">${message}</p>
    <a href="${webUrl}/jobs" style="display:inline-block;background:#1a3a5c;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open my job tracker</a>
  </div>
</body>
</html>`;
}
