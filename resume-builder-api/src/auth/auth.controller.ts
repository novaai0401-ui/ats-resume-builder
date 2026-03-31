import { BadRequestException, Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
  @Throttle({ short: { limit: 3, ttl: 60000 }, long: { limit: 5, ttl: 300000 } })
  register(@Body() body: RegisterDto) {
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.register(parsed.data);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ short: { limit: 5, ttl: 60000 }, long: { limit: 10, ttl: 300000 } })
  login(@Body() body: { email: string; password: string }) {
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }
    return this.authService.loginWithPassword(email, password);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Throttle({ short: { limit: 3, ttl: 60000 }, long: { limit: 5, ttl: 300000 } })
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
}
