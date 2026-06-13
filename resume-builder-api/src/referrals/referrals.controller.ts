import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReferralsService } from './referrals.service';

/**
 * R-037 owner-side endpoint. The referral is RECORDED inside the
 * register flow (AuthService), not here — this controller only serves
 * the Settings card.
 */
@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @Get('me')
  me(@Req() req: { user: { userId: string } }) {
    return this.service.me(req.user.userId);
  }
}
