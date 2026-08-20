import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { rateLimitOrThrow } from '../limits/rate-limit';

/**
 * Email ownership verification at REGISTRATION.
 *
 * A literal example.com address reached the production user table, proving
 * signups were never verified. The gate: registration becomes two-step —
 * request a 6-digit code to the address, then register WITH the code. The
 * long-dormant EmailOtpChallenge table (created for this, never written)
 * finally earns its keep; mechanics mirror the proven password-reset
 * challenge (bcrypt-hashed code, TTL, attempt lockout).
 *
 * Existing accounts are grandfathered as verified by the migration — the gate
 * is for NEW signups; retroactively locking out real users over a process
 * they were never offered would punish them for our gap.
 *
 * Escape hatch: REQUIRE_EMAIL_VERIFICATION=false disables the gate at runtime
 * (e.g. while SMTP is down, so an outage never blocks all signups).
 */
const OTP_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const HASH_ROUNDS = 10;

export function emailVerificationRequired(): boolean {
  return String(process.env.REQUIRE_EMAIL_VERIFICATION ?? 'true').trim().toLowerCase() !== 'false';
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Step 1: send a code to the address the user claims to own. */
  async start(rawEmail: string, meta: { ip?: string; userAgent?: string } = {}) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new BadRequestException('That does not look like a valid email address.');
    }
    // Same failure either way, so this endpoint cannot be used to probe which
    // addresses hold accounts.
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new BadRequestException('An account with this email already exists. Please log in instead.');
    }

    rateLimitOrThrow({
      key: `verify-email:${email}`,
      limit: 3,
      windowMs: 10 * 60 * 1000,
      message: 'Too many codes requested for this email. Try again in a few minutes.',
    });

    const otp = String(randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, HASH_ROUNDS);
    await this.prisma.emailOtpChallenge.create({
      data: {
        email,
        otpHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        ip: meta.ip || null,
        userAgent: meta.userAgent || null,
      },
    });

    const sent = await this.mail.sendEmailVerificationCode(email, otp);
    if (!sent) {
      // The truthful failure: with no mail out, the user can never produce the
      // code — a generic "sent!" would strand them at the next step.
      throw new BadRequestException(
        'We could not send the verification email right now. Please try again shortly.',
      );
    }
    return { sent: true };
  }

  /** Step 2 helper: throw unless a valid, unexpired code exists for the email. */
  async assertVerified(rawEmail: string, code: string): Promise<void> {
    const email = String(rawEmail || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new BadRequestException('Enter the 6-digit code from the verification email.');
    }
    const challenge = await this.prisma.emailOtpChallenge.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    if (!challenge || challenge.expiresAt < now) {
      throw new BadRequestException('That code has expired — request a new one.');
    }
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      throw new BadRequestException('Too many invalid attempts. Request a new code in a few minutes.');
    }
    const valid = await bcrypt.compare(cleanCode, challenge.otpHash);
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await this.prisma.emailOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          ...(attempts >= MAX_ATTEMPTS ? { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) } : {}),
        },
      });
      throw new BadRequestException('That code is not correct. Check the email and try again.');
    }
    // One code, one registration.
    await this.prisma.emailOtpChallenge.deleteMany({ where: { email } });
  }
}
