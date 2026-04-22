import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('public')
  async getPublicFlags() {
    const paymentFeatureEnabled = await this.settingsService.isPaymentFeatureEnabled();
    return { paymentFeatureEnabled };
  }

  /**
   * The user has either saved or cleared their BYOK AI key in the browser.
   * The key itself never touches the server; we only record the boolean so
   * the admin dashboard can surface an aggregate "users with BYOK key" count.
   */
  @Post('byok-key-flag')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async setByokKeyFlag(
    @Req() req: { user: { userId: string } },
    @Body() body: { enabled: boolean },
  ) {
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { byokKeyEnabled: Boolean(body?.enabled) },
    });
    return { ok: true };
  }
}
