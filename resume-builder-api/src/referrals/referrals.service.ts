import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * R-037 — referral credits.
 *
 * Mechanic: every user has a stable referral code. A signup that
 * carries the code earns the referrer +1 export credit
 * (User.premiumCredits). Credits are consumed by the export-quota
 * check in ResumeService — when the monthly PDF/DOCX limit is
 * exhausted, one credit buys one more export instead of a 403.
 *
 * Why export credits and not AI tokens or cash: the export is the
 * single moment of obvious value ("I need the PDF NOW") and the
 * sachet-pricing rail already trained users that one export ≈ ₹49.
 * One referral == one ₹49-equivalent is legible without a pricing
 * table.
 *
 * Anti-abuse (acceptance criteria from REQUIREMENTS R-037):
 *   - referredUserId is unique     → an account credits at most once.
 *   - emailHash is unique          → same email never credits twice,
 *     even across delete/re-create cycles.
 *   - per-IP cap (3 per 30 days)   → one machine farming throwaway
 *     addresses stops paying out after 3.
 *   - self-referral is suppressed  → your own code on your own signup
 *     does nothing.
 * Suppressed referrals still write a Referral row with
 * creditGranted=false so the admin dashboard sees the attempts.
 *
 * Refund-on-deletion (30-day clawback) is DEFERRED: the product has
 * no account-deletion endpoint yet. Decision logged in REQUIREMENTS
 * §7 — when deletion ships, it must claw back credits granted for
 * accounts deleted within 30 days of signup.
 *
 * recordReferral is fire-and-forget from the register flow: a
 * referral bug must never block a signup.
 */

const IP_CREDIT_CAP = 3;
const IP_CAP_WINDOW_DAYS = 30;
const CODE_LENGTH = 8;
// No 0/1/l/o — codes get read aloud and retyped from phone screens.
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * The user's referral overview for the Settings card. Generates and
   * persists the code on first call; stable forever after.
   */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, premiumCredits: true },
    });
    if (!user) return null;

    let code = user.referralCode;
    if (!code) {
      code = await this.allocateCode(userId);
    }

    const referrals = await this.prisma.referral.count({
      where: { referrerUserId: userId, creditGranted: true },
    });

    return {
      code,
      creditedReferrals: referrals,
      credits: user.premiumCredits,
    };
  }

  /**
   * Called from the register flow when a signup carries a referral
   * code. Never throws — returns a result object for logging only.
   */
  async recordReferral(input: {
    code: string;
    referredUserId: string;
    referredEmail: string;
    ip?: string;
  }): Promise<{ credited: boolean; reason: string }> {
    try {
      const code = String(input.code || '').trim().toLowerCase();
      if (!code) return { credited: false, reason: 'no_code' };

      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!referrer) return { credited: false, reason: 'unknown_code' };
      if (referrer.id === input.referredUserId) {
        await this.writeRow(referrer.id, input, false);
        return { credited: false, reason: 'self_referral' };
      }

      const emailHash = hashEmail(input.referredEmail);
      const emailUsed = await this.prisma.referral.findUnique({ where: { emailHash } });
      if (emailUsed) return { credited: false, reason: 'email_already_credited' };

      const ipHash = input.ip ? hashIp(input.ip) : null;
      if (ipHash) {
        const windowStart = new Date(Date.now() - IP_CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const fromThisIp = await this.prisma.referral.count({
          where: { ipHash, creditGranted: true, createdAt: { gte: windowStart } },
        });
        if (fromThisIp >= IP_CREDIT_CAP) {
          await this.writeRow(referrer.id, input, false);
          return { credited: false, reason: 'ip_cap_reached' };
        }
      }

      await this.writeRow(referrer.id, input, true);
      await this.prisma.user.update({
        where: { id: referrer.id },
        data: { premiumCredits: { increment: 1 } },
      });

      this.analytics.track({
        type: 'referral_credited',
        properties: { referrerUserId: referrer.id },
      });
      return { credited: true, reason: 'ok' };
    } catch (err) {
      // Unique-constraint races (two signups with the same email hash
      // in flight) land here — that's the constraint doing its job.
      this.logger.warn(
        `recordReferral failed: ${err instanceof Error ? err.message : err}`,
      );
      return { credited: false, reason: 'error' };
    }
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async writeRow(
    referrerUserId: string,
    input: { referredUserId: string; referredEmail: string; ip?: string },
    creditGranted: boolean,
  ) {
    await this.prisma.referral.create({
      data: {
        referrerUserId,
        referredUserId: input.referredUserId,
        emailHash: hashEmail(input.referredEmail),
        ipHash: input.ip ? hashIp(input.ip) : null,
        creditGranted,
      },
    });
  }

  private async allocateCode(userId: string, maxAttempts = 5): Promise<string> {
    // Deterministic first candidate (hash of userId) so the code is
    // reproducible in support conversations; random retries on the
    // astronomically-unlikely collision.
    let candidate = deterministicCode(userId);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { referralCode: candidate },
        });
        return candidate;
      } catch {
        candidate = randomCode();
      }
    }
    throw new Error('Could not allocate a referral code.');
  }
}

// ── pure helpers (exported for tests) ────────────────────────────────

export function deterministicCode(userId: string): string {
  const digest = createHash('sha256').update(`referral:${userId}`).digest();
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(`ref-email:${String(email || '').trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

export function hashIp(ip: string): string {
  return createHash('sha256')
    .update(`ref-ip:${String(ip || '').trim()}`)
    .digest('hex')
    .slice(0, 24);
}

export const __testables = { deterministicCode, randomCode, hashEmail, hashIp, CODE_ALPHABET, IP_CREDIT_CAP };
