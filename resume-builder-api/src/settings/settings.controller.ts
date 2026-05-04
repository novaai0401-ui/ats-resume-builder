import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('public')
  async getPublicFlags() {
    const paymentFeatureEnabled = await this.settingsService.isPaymentFeatureEnabled();
    return { paymentFeatureEnabled };
  }

  // The /byok-key-flag endpoint was removed. We no longer offer
  // bring-your-own-key — every paid user routes through the single
  // shared GROQ key configured by the operator. See
  // docs/subscription-mechanics.md for the rationale.
}
