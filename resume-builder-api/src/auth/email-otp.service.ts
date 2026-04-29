import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';

const HASH_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

type CounterEntry = { count: number; windowStart: number };
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_PER_HOUR = 20;

const emailSendCounters = new Map<string, CounterEntry>();
const ipSendCounters = new Map<string, CounterEntry>();

@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async requestOtp(email: string, meta: { ip?: string; userAgent?: string } = {}) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('Invalid email address.');
    }

    // User-enumeration defense: we never tell the caller whether the
    // email matches a real account. Same response either way; we just
    // skip the actual send when there's no user. This prevents an
    // attacker from harvesting valid emails by hammering the endpoint.
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    const okResponse = { ok: true, message: 'If an account exists for that email, a verification code has been sent.' };
    if (!user) {
      // Still consume rate limits so an attacker can't probe at full speed.
      try { this.enforceRateLimits(normalized, meta.ip); } catch { /* swallow */ }
      return okResponse;
    }

    // Rate limit checks (real path)
    this.enforceRateLimits(normalized, meta.ip);

    // Cooldown check
    const now = Date.now();
    const latestChallenge = await this.prisma.emailOtpChallenge.findFirst({
      where: { email: normalized },
      orderBy: { createdAt: 'desc' },
    });

    if (latestChallenge?.lockedUntil && latestChallenge.lockedUntil.getTime() > now) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (latestChallenge && now - latestChallenge.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException('OTP already sent. Please wait 60 seconds.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, HASH_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Remove old challenges for this email
    await this.prisma.emailOtpChallenge.deleteMany({ where: { email: normalized } });
    await this.prisma.emailOtpChallenge.create({
      data: {
        email: normalized,
        otpHash,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    // Send OTP via configured SMTP
    if (!this.mailService.isConfigured) {
      this.logger.error(
        'SMTP not configured. To send OTP emails, uncomment and fill SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in your .env file. See .env.example for provider examples (Gmail, Outlook, Zoho, SES, SendGrid).',
      );
      throw new HttpException(
        'Email delivery is not configured. Please configure SMTP in .env to enable OTP emails.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const sent = await this.mailService.sendOtpEmail(normalized, otp);
    if (!sent) {
      throw new HttpException('Failed to send verification email. Please try again.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return okResponse;
  }

  async verifyOtp(email: string, otp: string, meta: { ip?: string; userAgent?: string } = {}) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('Invalid email address.');
    }

    const challenge = await this.prisma.emailOtpChallenge.findFirst({
      where: { email: normalized },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new UnauthorizedException('OTP not requested. Please request a new OTP.');
    }

    const now = new Date();
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (challenge.expiresAt.getTime() < now.getTime()) {
      throw new UnauthorizedException('OTP expired. Please request a new OTP.');
    }

    const isValid = await bcrypt.compare(otp, challenge.otpHash);
    if (!isValid) {
      const nextAttempts = challenge.attempts + 1;
      const updates: { attempts: number; lockedUntil?: Date } = { attempts: nextAttempts };
      if (nextAttempts >= MAX_ATTEMPTS) {
        updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await this.prisma.emailOtpChallenge.update({ where: { id: challenge.id }, data: updates });
      throw new UnauthorizedException('Invalid OTP. Please try again.');
    }

    // OTP valid — clean up
    await this.prisma.emailOtpChallenge.deleteMany({ where: { email: normalized } });

    // Find user and issue tokens
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, fullName: true, mobile: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    // Increment login count and record login event
    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginCount: { increment: 1 } },
    });

    await this.authService.recordLoginAndAlertIfNewDevice({
      userId: user.id,
      email: normalized,
      method: 'email_otp',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.authService.issueTokensForUser(user);
  }

  private generateOtp(): string {
    return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  }

  private enforceRateLimits(email: string, ip?: string) {
    if (!consumeCounter(emailSendCounters, email, MAX_REQUESTS_PER_EMAIL_PER_HOUR)) {
      throw new HttpException('Too many OTP requests for this email. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const ipKey = String(ip || '').trim();
    if (ipKey && !consumeCounter(ipSendCounters, ipKey, MAX_REQUESTS_PER_IP_PER_HOUR)) {
      throw new HttpException('Too many OTP requests from this IP. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

function consumeCounter(store: Map<string, CounterEntry>, key: string, limit: number): boolean {
  const now = Date.now();
  const current = store.get(key);
  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (current.count >= limit) {
    return false;
  }
  current.count += 1;
  store.set(key, current);
  return true;
}
