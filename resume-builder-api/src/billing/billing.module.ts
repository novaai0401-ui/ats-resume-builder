import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RazorpayService } from './razorpay.service';
import { DownloadChargeService } from './download-charge.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev_secret'),
      }),
    }),
  ],
  controllers: [BillingController],
  providers: [BillingService, RazorpayService, DownloadChargeService],
  exports: [RazorpayService, DownloadChargeService],
})
export class BillingModule {}
