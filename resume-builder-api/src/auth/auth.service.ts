import { BadRequestException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from 'resume-builder-shared';
import { getPlanConfig } from '../billing/plan-limits';
import { resetUsageForPlan } from '../billing/usage';
import { normalizeMobile } from './mobile.util';
import { MailService } from '../mail/mail.service';
import { ReferralsService } from '../referrals/referrals.service';
import { enforcePasswordPolicy } from './password-hygiene';
import { EmailVerificationService, emailVerificationRequired } from './email-verification.service';

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';
const OTP_SESSION_TTL_SECONDS = 30 * 60;

type SessionType = 'default' | 'otp';

type TokenIssueOptions = {
  accessExpiresSeconds: number;
  refreshExpiresSeconds: number;
  sessionType: SessionType;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly mailService?: MailService,
    // R-037: optional so auth unit tests that stub the module context
    // don't have to provide it. When absent, referral codes on signup
    // are silently ignored — registration never depends on referrals.
    @Optional() private readonly referralsService?: ReferralsService,
    // Optional for the same unit-test reason. When absent, the email
    // verification gate is skipped (test stubs), never half-enforced.
    @Optional() private readonly emailVerification?: EmailVerificationService,
  ) {}

  /**
   * Persist a login event; if the (ip, user-agent) fingerprint has never been
   * seen for this user, send a new-device alert email. Fire-and-forget so a
   * mail failure never blocks login.
   */
  async recordLoginAndAlertIfNewDevice(params: {
    userId: string;
    email: string;
    method: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    const ip = (params.ip || '').trim();
    const userAgent = (params.userAgent || '').trim();
    const fingerprint = fingerprintDevice(ip, userAgent);

    let isNewDevice = false;
    if (fingerprint) {
      const prior = await this.prisma.loginEvent.findFirst({
        where: { userId: params.userId, ip: ip || undefined, userAgent: userAgent || undefined },
        select: { id: true },
      });
      if (!prior) {
        const anyPrior = await this.prisma.loginEvent.findFirst({
          where: { userId: params.userId },
          select: { id: true },
        });
        isNewDevice = Boolean(anyPrior);
      }
    }

    await this.prisma.loginEvent.create({
      data: {
        userId: params.userId,
        email: params.email,
        method: params.method,
        ip: ip || null,
        userAgent: userAgent || null,
      },
    });

    if (isNewDevice && this.mailService && this.mailService.isConfigured) {
      void this.mailService
        .sendNewDeviceLoginAlert({
          to: params.email,
          ip: ip || 'unknown',
          userAgent: userAgent || 'unknown',
          when: new Date(),
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to send new-device alert to ${params.email}: ${msg}`);
        });
    }
  }

  /**
   * The user's recent sign-ins for the Settings "Login activity" card. 20 is
   * plenty to spot a device that isn't yours; older rows stay in the table
   * for support/audit but aren't shipped to the client.
   */
  async listLoginActivity(userId: string) {
    const events = await this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, method: true, ip: true, userAgent: true, createdAt: true },
    });
    return { events };
  }

  async register(dto: RegisterDto, meta: { ip?: string } = {}) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException('An account with this email already exists. Please log in instead.');
    }

    // Email ownership gate: a literal example.com address reached production,
    // so an account is only created once the caller proves they can read the
    // inbox (6-digit code from POST /auth/register/start). The marker token in
    // the message lets the web client detect "need the code step" reliably.
    if (emailVerificationRequired() && this.emailVerification) {
      if (!dto.otp) {
        throw new BadRequestException(
          'EMAIL_VERIFICATION_REQUIRED: verify your email first — request a code and register with it.',
        );
      }
      await this.emailVerification.assertVerified(email, dto.otp);
    }

    // Email-only onboarding: mobile is OPTIONAL (we do not run paid SMS
    // verification at this stage). When the user DOES provide one it must
    // normalize to a valid number and stay unique across accounts.
    let mobile: string | null = null;
    if (dto.mobile && String(dto.mobile).trim()) {
      mobile = normalizeMobile(dto.mobile);
      if (!mobile) {
        throw new BadRequestException('That mobile number does not look valid. Leave it blank or fix it.');
      }
      const existingMobile = await this.prisma.user.findUnique({
        where: { mobile },
      });
      if (existingMobile) {
        throw new BadRequestException('This mobile number is already linked to another account. Please use another mobile number.');
      }
    }

    // Generate a random password hash if no password provided (email OTP flow).
    // When a password IS provided, enforce complexity + HIBP breach check.
    let hasUserSetPassword = false;
    if (dto.password) {
      try {
        await enforcePasswordPolicy(dto.password);
      } catch (err: unknown) {
        throw new BadRequestException(err instanceof Error ? err.message : 'Password rejected.');
      }
      hasUserSetPassword = true;
    }
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : await bcrypt.hash(randomBytes(32).toString('hex'), 12);

    const adminEmails = parseAdminEmails(this.config.get<string>('ADMIN_EMAILS', ''));
    const isAdmin = adminEmails.has(email);

    const planConfig = getPlanConfig('FREE');
    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName,
        mobile,
        passwordHash,
        plan: 'FREE',
        isAdmin,
        primaryAuthProvider: 'password',
        hasUserSetPassword,
        // Reaching this point means the code check passed (or the gate is
        // off / running in a test stub) — the address is considered proven.
        emailVerifiedAt: new Date(),
        aiTokensLimit: planConfig.aiTokensLimit,
        pdfExportsLimit: planConfig.pdfExportsLimit,
        atsScansLimit: planConfig.atsScansLimit,
        resumesLimit: planConfig.resumesLimit,
      },
      select: { id: true, email: true, fullName: true, mobile: true },
    });
    await resetUsageForPlan(this.prisma, user.id, 'FREE');

    // R-037: best-effort referral credit. Fire-and-forget — a referral
    // bug must never block or slow a signup. The service applies the
    // anti-abuse rules (self-referral, email reuse, per-IP cap).
    if (dto.referralCode && this.referralsService) {
      void this.referralsService
        .recordReferral({
          code: dto.referralCode,
          referredUserId: user.id,
          referredEmail: email,
          ip: meta.ip,
        })
        .catch(() => undefined);
    }

    return this.issueTokensForUser(user);
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshTokenHash || !user.refreshTokenExpiresAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const expired = user.refreshTokenExpiresAt.getTime() < Date.now();
    if (expired) {
      throw new UnauthorizedException('Refresh token expired');
    }
    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const sessionType = await this.readSessionTypeFromRefreshToken(refreshToken, userId);
    if (sessionType === 'otp') {
      return this.issueOtpSessionForUser(user);
    }
    return this.issueTokensForUser(user);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
    });
    return { ok: true };
  }

  /** Bump lastActiveAt without issuing new tokens. Used by /auth/heartbeat. */
  async bumpLastActive(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
      });
    } catch {
      // Heartbeat failures must never surface to the user — swallow quietly.
    }
  }

  /** Password-based login. */
  async loginWithPassword(email: string, password: string, meta: { ip?: string; userAgent?: string } = {}) {
    const normalized = email.trim().toLowerCase();
    this.enforceIpLoginRateLimit(meta.ip);
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    // OAuth lock-in: if the account was created via a social provider and the
    // user hasn't explicitly set a password yet, refuse password login and
    // point them back to the correct provider.
    if (user.primaryAuthProvider !== 'password' && !user.hasUserSetPassword) {
      throw new UnauthorizedException(
        `Please sign in with ${humanizeProvider(user.primaryAuthProvider)}. You can add a password from settings after signing in.`,
      );
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      // Relative duration avoids GMT/timezone confusion — clearer for the
      // user than an absolute UTC timestamp in a foreign timezone.
      const minutesLeft = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
      const wait = minutesLeft === 1 ? 'about a minute' : `about ${minutesLeft} minutes`;
      throw new UnauthorizedException(
        `Account temporarily locked due to repeated failed attempts. Please try again in ${wait}, or reset your password.`,
      );
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.recordFailedPasswordAttempt(user.id, user.failedLoginCount);
      throw new UnauthorizedException('Invalid email or password.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginCount: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
        lastActiveAt: new Date(),
      },
    });
    await this.recordLoginAndAlertIfNewDevice({
      userId: user.id,
      email: user.email,
      method: 'password',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.issueTokensForUser({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      mobile: user.mobile,
    });
  }

  /**
   * Bump the failed-attempt counter and, after MAX_FAILED_ATTEMPTS, lock the
   * account for LOCKOUT_MINUTES. Single user-visible message stays "invalid
   * credentials" until the lockout hits, so attackers can't use the response
   * to enumerate account state.
   */
  private async recordFailedPasswordAttempt(userId: string, priorCount: number): Promise<void> {
    const MAX_FAILED_ATTEMPTS = 5;
    const LOCKOUT_MINUTES = 15;
    const nextCount = priorCount + 1;
    const shouldLock = nextCount >= MAX_FAILED_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: nextCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });
  }

  /**
   * Coarse-grained per-IP rate limit on login attempts. Uses the in-process
   * counter map; for multi-instance deployments point at Redis.
   */
  private enforceIpLoginRateLimit(ip?: string): void {
    const MAX_PER_WINDOW = 30;
    const WINDOW_MS = 5 * 60 * 1000;
    const key = (ip || '').trim();
    if (!key) return;
    const now = Date.now();
    const entry = loginIpCounters.get(key);
    if (!entry || now - entry.windowStart > WINDOW_MS) {
      loginIpCounters.set(key, { windowStart: now, count: 1 });
      return;
    }
    entry.count += 1;
    if (entry.count > MAX_PER_WINDOW) {
      throw new UnauthorizedException('Too many login attempts from this IP. Please wait a few minutes.');
    }
  }

  /** Set a new password (for forgot/reset flow). */
  async resetPassword(email: string, newPassword: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    try {
      await enforcePasswordPolicy(newPassword);
    } catch (err: unknown) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Password rejected.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, hasUserSetPassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    return { ok: true, message: 'Password has been reset successfully.' };
  }

  /** Change password for authenticated user. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    // Social accounts that never set a password can reach this via
    // `linkPassword` only; reject the change-password flow for them so the
    // "current password" check isn't meaningless.
    if (!user.hasUserSetPassword) {
      throw new BadRequestException('Your account does not have a password yet. Use Link Password from settings instead.');
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    try {
      await enforcePasswordPolicy(newPassword);
    } catch (err: unknown) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Password rejected.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, hasUserSetPassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    return { ok: true, message: 'Password changed successfully.' };
  }

  /**
   * Let an authenticated social-login user set a password for the first time
   * so they can sign in with email+password in addition to OAuth. Stays a
   * separate method from `changePassword` because there's no current password
   * to verify — authorization comes from the JWT.
   */
  async linkPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    try {
      await enforcePasswordPolicy(newPassword);
    } catch (err: unknown) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Password rejected.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, hasUserSetPassword: true },
    });
    return { ok: true, message: 'Password linked to your account.' };
  }

  async issueTokensForUser(user: { id: string; email: string; fullName: string; mobile?: string | null }) {
    const accessExpires = durationToSeconds(this.config.get<string>('JWT_EXPIRES_IN', '7d'), 7 * 24 * 60 * 60);
    const refreshExpires = durationToSeconds(this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'), 30 * 24 * 60 * 60);
    const isAdmin = this.checkIsAdmin(user.email);
    // Look up user plan for the auth response
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } });
    const plan = dbUser?.plan || 'FREE';
    const result = await this.issueTokens(user.id, user.email, user.fullName, user.mobile ?? undefined, isAdmin, {
      accessExpiresSeconds: accessExpires,
      refreshExpiresSeconds: refreshExpires,
      sessionType: 'default',
    });
    return { ...result, plan };
  }

  async issueOtpSessionForUser(user: { id: string; email: string; fullName: string; mobile?: string | null }) {
    const sessionTtl = durationToSeconds(
      this.config.get<string>('OTP_SESSION_EXPIRES_IN', '30m'),
      OTP_SESSION_TTL_SECONDS,
    );
    const isAdmin = this.checkIsAdmin(user.email);
    return this.issueTokens(user.id, user.email, user.fullName, user.mobile ?? undefined, isAdmin, {
      accessExpiresSeconds: sessionTtl,
      refreshExpiresSeconds: sessionTtl,
      sessionType: 'otp',
    });
  }

  private checkIsAdmin(email: string): boolean {
    const adminEmails = parseAdminEmails(this.config.get<string>('ADMIN_EMAILS', ''));
    return adminEmails.has(email.trim().toLowerCase());
  }

  private async issueTokens(userId: string, email: string, fullName: string, mobile: string | undefined, isAdmin: boolean, options: TokenIssueOptions) {
    const accessExpires = options.accessExpiresSeconds;
    const refreshExpires = options.refreshExpiresSeconds;

    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        email,
        typ: ACCESS_TOKEN_TYPE,
        mobile,
        sess: options.sessionType,
        adm: isAdmin,
      },
      {
        secret: this.config.get<string>('JWT_SECRET', 'dev_secret'),
        expiresIn: accessExpires,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: userId,
        email,
        typ: REFRESH_TOKEN_TYPE,
        mobile,
        sess: options.sessionType,
      },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
        expiresIn: refreshExpires,
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpires * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash, refreshTokenExpiresAt },
    });

    const expiresAt = new Date(Date.now() + accessExpires * 1000).toISOString();

    return {
      user: { id: userId, email, fullName, isAdmin },
      accessToken,
      refreshToken,
      expiresAt,
    };
  }

  private async readSessionTypeFromRefreshToken(refreshToken: string, expectedUserId: string): Promise<SessionType> {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
      }) as { sub?: string; typ?: string; sess?: string };
      if (payload?.typ !== REFRESH_TOKEN_TYPE || payload.sub !== expectedUserId) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return payload.sess === 'otp' ? 'otp' : 'default';
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

/** In-memory per-IP login rate-limit counter. Swap with Redis for multi-instance deployments. */
const loginIpCounters = new Map<string, { windowStart: number; count: number }>();

function humanizeProvider(provider: string): string {
  switch (provider) {
    case 'google': return 'Google';
    case 'github': return 'GitHub';
    case 'linkedin': return 'LinkedIn';
    case 'yahoo': return 'Yahoo';
    case 'email_otp': return 'the email OTP flow';
    default: return 'your original sign-in method';
  }
}

function fingerprintDevice(ip: string, userAgent: string): string {
  const raw = `${ip}|${userAgent}`;
  if (!ip && !userAgent) return '';
  return createHash('sha256').update(raw).digest('hex');
}

function parseAdminEmails(raw: string): Set<string> {
  return new Set(
    String(raw || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function durationToSeconds(value: string, fallbackSeconds: number): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallbackSeconds;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 24 * 60 * 60;
    default:
      return fallbackSeconds;
  }
}
