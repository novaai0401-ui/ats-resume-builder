import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from 'resume-builder-shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';

const HASH_ROUNDS = 12;
const OTP_TTL_MS = 15 * 60 * 1000;          // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;       // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;    // 15 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_PER_HOUR = 20;

type CounterEntry = { count: number; windowStart: number };
const emailCounters = new Map<string, CounterEntry>();
const ipCounters = new Map<string, CounterEntry>();

const ENUMERATION_SAFE_RESPONSE = {
  ok: true,
  message: 'If an account exists for that email, we have sent a reset code.',
};

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Email-enumeration-safe: always responds with the same generic message,
   * even if the email doesn't exist. Internally only sends a real OTP when
   * the email matches a real account that has actually set a password.
   */
  async requestReset(rawEmail: string, meta: RequestMeta = {}) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      // Still respond uniformly, but don't bother enforcing rate limits on
      // obviously malformed input — that just helps an attacker probe the
      // service. Log it and move on.
      this.logger.warn(`Password-reset requested with invalid email shape`);
      return ENUMERATION_SAFE_RESPONSE;
    }

    if (!consume(emailCounters, email, MAX_REQUESTS_PER_EMAIL_PER_HOUR)) {
      throw new HttpException(
        'Too many reset requests for this email. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const ipKey = String(meta.ip || '').trim();
    if (ipKey && !consume(ipCounters, ipKey, MAX_REQUESTS_PER_IP_PER_HOUR)) {
      throw new HttpException(
        'Too many reset requests from this IP. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Pretend we sent a code — same response shape, no leak.
      return ENUMERATION_SAFE_RESPONSE;
    }
    if (!user.hasUserSetPassword) {
      // Account exists but uses social-only auth. Still respond uniformly,
      // but log so support can guide the user (they must use Link Password).
      this.logger.log(
        `Password-reset requested for social-only account ${user.id}; ignoring`,
      );
      return ENUMERATION_SAFE_RESPONSE;
    }

    // Cooldown: prevent flooding. We keep a single active challenge per email.
    const latest = await this.prisma.passwordResetChallenge.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    if (latest?.lockedUntil && latest.lockedUntil.getTime() > now) {
      throw new HttpException(
        'Too many invalid attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (latest && now - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException(
        'A reset code was just sent. Please wait 60 seconds before requesting another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Fail fast BEFORE creating a challenge — otherwise a failed send would
    // leave a challenge (and its 60s cooldown) behind, so the user's retry
    // returns a fake "a code was just sent" and no email ever goes out.
    if (!this.mailService.isConfigured) {
      this.logger.error(
        'SMTP not configured. Password-reset OTP cannot be delivered. Configure SMTP in .env.',
      );
      throw new HttpException(
        'Email delivery is not configured. Contact support.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, HASH_ROUNDS);
    const expiresAt = new Date(now + OTP_TTL_MS);

    // Send FIRST; only persist the challenge once a code has actually been
    // delivered. A send failure creates nothing, so the user can retry
    // immediately and always sees the real error (not a bogus success).
    const sent = await this.mailService.sendPasswordResetEmail(email, otp);
    if (!sent) {
      throw new HttpException(
        'Failed to send reset email. Please try again.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.prisma.passwordResetChallenge.deleteMany({ where: { email } });
    await this.prisma.passwordResetChallenge.create({
      data: { email, otpHash, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
    });
    return ENUMERATION_SAFE_RESPONSE;
  }

  async confirmReset(rawEmail: string, otp: string, newPassword: string) {
    const email = String(rawEmail || '').trim().toLowerCase();
    const code = String(otp || '').trim();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Invalid email address.');
    }
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid reset code.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(PASSWORD_TOO_SHORT_MESSAGE);
    }

    const challenge = await this.prisma.passwordResetChallenge.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new UnauthorizedException('No active reset request. Request a new code.');
    }
    const now = new Date();
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      throw new HttpException(
        'Too many invalid attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (challenge.expiresAt.getTime() < now.getTime()) {
      throw new UnauthorizedException('Reset code expired. Request a new one.');
    }

    const valid = await bcrypt.compare(code, challenge.otpHash);
    if (!valid) {
      const nextAttempts = challenge.attempts + 1;
      const updates: { attempts: number; lockedUntil?: Date } = { attempts: nextAttempts };
      if (nextAttempts >= MAX_VERIFY_ATTEMPTS) {
        updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await this.prisma.passwordResetChallenge.update({
        where: { id: challenge.id },
        data: updates,
      });
      throw new UnauthorizedException('Invalid reset code.');
    }

    // Reuse the existing reset method (enforces password policy + clears
    // failed-login lockout).
    await this.authService.resetPassword(email, newPassword);

    // Burn the challenge so it can't be replayed.
    await this.prisma.passwordResetChallenge.deleteMany({ where: { email } });

    return { ok: true, message: 'Password reset successfully. You can now sign in.' };
  }
}

function generateOtp(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

function consume(store: Map<string, CounterEntry>, key: string, limit: number): boolean {
  const now = Date.now();
  const current = store.get(key);
  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  store.set(key, current);
  return true;
}
