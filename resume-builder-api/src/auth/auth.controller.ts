import { BadRequestException, Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterSchema,
  RefreshTokenSchema,
  type RegisterDto,
  type RefreshTokenDto,
} from 'resume-builder-shared';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.register(parsed.data);
  }

  @Post('login')
  @HttpCode(200)
  login(@Req() req: Request, @Body() body: { email: string; password: string }) {
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }
    const ip = extractIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    return this.authService.loginWithPassword(email, password, { ip, userAgent });
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
  logout(@Req() req: { user: { userId: string } }) {
    return this.authService.logout(req.user.userId);
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
