import { Global, Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/**
 * Global so AuthService can inject ReferralsService for the register
 * hook without creating an AuthModule → ReferralsModule → AuthModule
 * import cycle (referrals needs nothing from auth except the guard,
 * which is provided app-wide).
 */
@Global()
@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
