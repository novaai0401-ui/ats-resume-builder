import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * R-031 — Outcome-status nudge.
 *
 * Why this exists: the Outcome Graph (the moat) only works if status
 * changes get recorded. Users reliably log "applied" (the extension
 * does it for them) but rarely come back to log "rejected" /
 * "interview". This service closes that gap with ONE email per stale
 * application: "any reply from Acme? [No reply] [Rejected]
 * [Interview!]" where each button is a single-tap signed link — no
 * login required, status advances in one click from the mail client.
 *
 * Design decisions:
 *   - One nudge per application EVER per token-lifetime (30 d). The
 *     scan skips applications that already have an unexpired nudge —
 *     repeat-nagging is how products get marked as spam.
 *   - Opt-out honoured globally via User.nudgeEmailsEnabled; every
 *     email carries an unsubscribe link that flips it.
 *   - The endpoint that consumes tokens is UNauthenticated by design
 *     (the user is in their mail app, not our session) — the token IS
 *     the authorization. Single-use + 30-day expiry + 32-char random
 *     keeps the surface safe; worst case, someone with the email can
 *     set the status of one application, which the owner can correct.
 *   - 'no_reply' does not change status; it bumps nextActionAt +7 d so
 *     the application resurfaces in the tracker's follow-up queue.
 *
 * Trigger model: runNudgeScan() is invoked by POST /outcome-nudge/run
 * guarded by CRON_SECRET (Render Cron Job hits it daily). No in-process
 * scheduler — survives horizontal scaling without double-sends because
 * the scan itself is idempotent (unexpired-nudge check).
 */

const NUDGE_AFTER_DAYS = 7;
const TOKEN_TTL_DAYS = 30;
const BATCH_LIMIT = 200; // per scan run, keeps SMTP bursts sane

export type NudgeAction = 'no_reply' | 'rejected' | 'interview';

const ACTION_TO_STATUS: Record<NudgeAction, string | null> = {
  no_reply: null, // keep status; bump follow-up date instead
  rejected: 'rejected',
  interview: 'interview',
};

@Injectable()
export class OutcomeNudgeService {
  private readonly logger = new Logger(OutcomeNudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * Scan for stale applications and send one nudge each. Idempotent:
   * re-running immediately sends nothing new.
   * Returns counts for the cron log.
   */
  async runNudgeScan(appBaseUrl: string) {
    const cutoff = new Date(Date.now() - NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

    // Stale = applied, appliedAt older than cutoff, status not advanced.
    const stale = await this.prisma.jobApplication.findMany({
      where: {
        status: 'applied',
        appliedAt: { not: null, lt: cutoff },
      },
      orderBy: { appliedAt: 'asc' },
      take: BATCH_LIMIT,
      select: { id: true, userId: true, company: true, role: true, appliedAt: true },
    });

    let sent = 0;
    let skippedExisting = 0;
    let skippedOptOut = 0;
    let skippedNoEmail = 0;

    for (const app of stale) {
      // Skip if an unexpired nudge already exists for this application.
      const existing = await this.prisma.outcomeNudge.findFirst({
        where: { jobApplicationId: app.id, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (existing) { skippedExisting += 1; continue; }

      const user = await this.prisma.user.findUnique({
        where: { id: app.userId },
        select: { email: true, fullName: true, nudgeEmailsEnabled: true },
      });
      if (!user?.email) { skippedNoEmail += 1; continue; }
      if (!user.nudgeEmailsEnabled) { skippedOptOut += 1; continue; }

      const token = randomToken();
      const created = await this.prisma.outcomeNudge.create({
        data: {
          userId: app.userId,
          jobApplicationId: app.id,
          token,
          expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      const ok = await this.mail.sendOutcomeNudgeEmail({
        to: user.email,
        userName: user.fullName || '',
        company: app.company,
        role: app.role,
        appliedAt: app.appliedAt!,
        links: {
          noReply: `${appBaseUrl}/outcome-nudge/${token}/no_reply`,
          rejected: `${appBaseUrl}/outcome-nudge/${token}/rejected`,
          interview: `${appBaseUrl}/outcome-nudge/${token}/interview`,
          unsubscribe: `${appBaseUrl}/outcome-nudge/${token}/unsubscribe`,
        },
      });
      if (ok) {
        sent += 1;
      } else {
        // Send failed (SMTP outage / unconfigured). Delete the row so
        // the next scan retries this application — otherwise a single
        // transient failure silences the nudge for the whole 30-day
        // token lifetime and the outcome never gets captured.
        await this.prisma.outcomeNudge.delete({ where: { id: created.id } }).catch(() => undefined);
      }
    }

    const summary = { scanned: stale.length, sent, skippedExisting, skippedOptOut, skippedNoEmail };
    this.logger.log(`nudge scan: ${JSON.stringify(summary)}`);
    return summary;
  }

  /**
   * Consume a one-tap token. Unauthenticated — the token is the auth.
   * Returns what the confirmation page needs to render. Uniform
   * NotFoundException for missing / expired / used tokens (no oracle).
   */
  async applyAction(token: string, action: NudgeAction | 'unsubscribe') {
    const nudge = await this.prisma.outcomeNudge.findUnique({
      where: { token: String(token || '').trim() },
    });
    if (!nudge) throw new NotFoundException('This link is no longer valid.');
    if (nudge.expiresAt.getTime() < Date.now()) throw new NotFoundException('This link is no longer valid.');

    if (action === 'unsubscribe') {
      // Unsubscribe does NOT burn the token — the user may unsubscribe
      // and then still answer the question from the same email.
      await this.prisma.user.update({
        where: { id: nudge.userId },
        data: { nudgeEmailsEnabled: false },
      });
      this.analytics.track({ type: 'nudge_unsubscribed', properties: { nudgeId: nudge.id } });
      return { result: 'unsubscribed' as const };
    }

    if (nudge.usedAt) throw new NotFoundException('This link is no longer valid.');

    const app = await this.prisma.jobApplication.findUnique({
      where: { id: nudge.jobApplicationId },
      select: { id: true, company: true, role: true, status: true },
    });
    if (!app) throw new NotFoundException('This link is no longer valid.');

    const nextStatus = ACTION_TO_STATUS[action];
    if (nextStatus) {
      await this.prisma.jobApplication.update({
        where: { id: app.id },
        data: {
          status: nextStatus,
          ...(nextStatus === 'rejected' ? { closedAt: new Date() } : {}),
        },
      });
    } else {
      // no_reply: keep status, resurface in 7 days via nextActionAt.
      await this.prisma.jobApplication.update({
        where: { id: app.id },
        data: { nextActionAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });
    }

    await this.prisma.outcomeNudge.update({
      where: { id: nudge.id },
      data: { usedAt: new Date(), actionTaken: action },
    });

    this.analytics.track({
      type: 'nudge_outcome_recorded',
      properties: { action, nudgeId: nudge.id },
    });

    return {
      result: 'recorded' as const,
      action,
      company: app.company,
      role: app.role,
    };
  }
}

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomToken(length = 32): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

export const __testables = { randomToken, ACTION_TO_STATUS, NUDGE_AFTER_DAYS, TOKEN_TTL_DAYS };
