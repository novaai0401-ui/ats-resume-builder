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

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException('An account with this email already exists. Please log in instead.');
    }

    // Normalize and validate mobile
    const mobile = normalizeMobile(dto.mobile);
    if (!mobile) {
      throw new BadRequestException('A valid mobile number is required.');
    }

    // Check unique mobile
    const existingMobile = await this.prisma.user.findUnique({
      where: { mobile },
    });
    if (existingMobile) {
      throw new BadRequestException('This mobile number is already linked to another account. Please use another mobile number.');
    }

    // Generate a random password hash if no password provided (email OTP flow)
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
        aiTokensLimit: planConfig.aiTokensLimit,
        pdfExportsLimit: planConfig.pdfExportsLimit,
        atsScansLimit: planConfig.atsScansLimit,
        resumesLimit: planConfig.resumesLimit,
      },
      select: { id: true, email: true, fullName: true, mobile: true },
    });
    await resetUsageForPlan(this.prisma, user.id, 'FREE');
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

  /** Password-based login. */
  async loginWithPassword(email: string, password: string, meta: { ip?: string; userAgent?: string } = {}) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginCount: { increment: 1 } },
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

  /** Set a new password (for forgot/reset flow). */
  async resetPassword(email: string, newPassword: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { ok: true, message: 'Password has been reset successfully.' };
  }

  /** Change password for authenticated user. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { ok: true, message: 'Password changed successfully.' };
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
