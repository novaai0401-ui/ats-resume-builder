import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterSchema,
  RefreshTokenSchema,
  type RegisterDto,
  type RefreshTokenDto,
} from 'resume-builder-shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { EmailOtpService } from './email-otp.service';
import { LinkedInOAuthService } from './linkedin-oauth.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailOtpService: EmailOtpService,
    private readonly linkedInOAuth: LinkedInOAuthService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Whether social sign-in is available, so the UI can show/hide the button. */
  @Get('providers')
  providers() {
    return { linkedin: this.linkedInOAuth.isConfigured() };
  }

  /** Step 1: hand the client the LinkedIn authorize URL. */
  @Get('linkedin')
  linkedinStart() {
    return { url: this.linkedInOAuth.startUrl() };
  }

  /** Step 3: LinkedIn redirects here; we finish login and bounce to the web app. */
  @Get('linkedin/callback')
  async linkedinCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const web = this.linkedInOAuth.webCallbackUrl();
    if (error || !code) {
      return res.redirect(`${web}/auth/login?error=linkedin_${encodeURIComponent(error || 'no_code')}`);
    }
    try {
      const tokens = await this.linkedInOAuth.handleCallback(code, state);
      // Tokens travel in the URL fragment so they never hit server logs or
      // the Referer header; the web app reads them client-side on /auth/callback.
      const frag = new URLSearchParams({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userId: tokens.user.id,
        email: tokens.user.email,
        fullName: tokens.user.fullName,
        expiresAt: tokens.expiresAt,
        isAdmin: String(tokens.user.isAdmin),
        plan: String((tokens as { plan?: string }).plan ?? 'FREE'),
        provider: 'linkedin',
      }).toString();
      return res.redirect(`${web}/auth/callback#${frag}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'linkedin_failed';
      return res.redirect(`${web}/auth/login?error=${encodeURIComponent(message)}`);
    }
  }

  @Post('register')
  async register(@Req() req: Request, @Body() body: RegisterDto) {
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const result = await this.authService.register(parsed.data, { ip: extractIp(req) });
    this.analytics.track(
      {
        type: 'register',
        email: parsed.data.email,
        path: '/auth/register',
        properties: { method: 'password' },
      },
      req,
    );
    return result;
  }

  @Post('login')
  @HttpCode(200)
  async login(@Req() req: Request, @Body() body: { email: string; password: string }) {
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }
    const ip = extractIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    try {
      const result = await this.authService.loginWithPassword(email, password, { ip, userAgent });
      this.analytics.track(
        {
          type: 'login',
          email,
          path: '/auth/login',
          properties: { method: 'password' },
        },
        req,
      );
      return result;
    } catch (err) {
      this.analytics.track(
        {
          type: 'login_failed',
          email,
          path: '/auth/login',
          properties: {
            method: 'password',
            reason: err instanceof Error ? err.message : 'unknown',
          },
        },
        req,
      );
      throw err;
    }
  }

  /**
   * Request a one-time login code. Same endpoint covers initial sign-up
   * verification and ongoing passwordless logins; the service decides
   * whether the email belongs to an existing user. The response is
   * intentionally vague about which case it was — see the service for
   * the user-enumeration defense.
   */
  @Post('request-otp')
  @HttpCode(200)
  requestOtp(@Req() req: Request, @Body() body: { email: string }) {
    const ip = extractIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    return this.emailOtpService.requestOtp(String(body?.email || ''), { ip, userAgent });
  }

  /**
   * Verify a previously-issued code. On success returns the same
   * { accessToken, refreshToken, user } shape as /auth/login so
   * clients can swap one for the other without changing their session
   * handling.
   */
  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(@Req() req: Request, @Body() body: { email: string; otp: string }) {
    const ip = extractIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    const email = String(body?.email || '');
    try {
      const result = await this.emailOtpService.verifyOtp(
        email,
        String(body?.otp || ''),
        { ip, userAgent },
      );
      this.analytics.track(
        {
          type: 'login',
          email,
          path: '/auth/verify-otp',
          properties: { method: 'email_otp' },
        },
        req,
      );
      return result;
    } catch (err) {
      this.analytics.track(
        {
          type: 'login_failed',
          email,
          path: '/auth/verify-otp',
          properties: {
            method: 'email_otp',
            reason: err instanceof Error ? err.message : 'unknown',
          },
        },
        req,
      );
      throw err;
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  changePassword(@Req() req: { user: { userId: string } }, @Body() body: { currentPassword: string; newPassword: string }) {
    const currentPassword = String(body?.currentPassword || '');
    const newPassword = String(body?.newPassword || '');
    if (!currentPassword || newPassword.length < 8) {
      throw new BadRequestException('Current password and new password (min 8 chars) are required.');
    }
    return this.authService.changePassword(req.user.userId, currentPassword, newPassword);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto) {
    const parsed = RefreshTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.refresh(parsed.data.userId, parsed.data.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request & { user: { userId: string; email?: string } }) {
    const result = await this.authService.logout(req.user.userId);
    this.analytics.track(
      {
        type: 'logout',
        email: req.user.email,
        path: '/auth/logout',
      },
      req,
    );
    return result;
  }

  @Post('link-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  linkPassword(@Req() req: { user: { userId: string } }, @Body() body: { newPassword: string }) {
    const newPassword = String(body?.newPassword || '');
    if (!newPassword) {
      throw new BadRequestException('newPassword is required.');
    }
    return this.authService.linkPassword(req.user.userId, newPassword);
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Req() req: Request, @Body() body: { email: string }) {
    const ip = extractIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    return this.passwordResetService.requestReset(String(body?.email || ''), { ip, userAgent });
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() body: { email: string; otp: string; newPassword: string }) {
    return this.passwordResetService.confirmReset(
      String(body?.email || ''),
      String(body?.otp || ''),
      String(body?.newPassword || ''),
    );
  }

  /**
   * Lightweight heartbeat so the admin dashboard's "active right now" metric
   * has something current to read. The web client already polls via
   * startSessionHeartbeat; this gives it a real endpoint to hit.
   */
  @Post('heartbeat')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async heartbeat(@Req() req: { user: { userId: string } }) {
    await this.authService.bumpLastActive(req.user.userId);
  }
}

function extractIp(req: Request): string {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return fwd || req.ip || (req.socket?.remoteAddress ?? '') || '';
}
