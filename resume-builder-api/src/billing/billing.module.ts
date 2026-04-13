import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RazorpayService } from './razorpay.service';

@Module({
  imports: [ConfigModule],
  controllers: [BillingController],
  providers: [BillingService, RazorpayService],
  exports: [RazorpayService],
})
export class BillingModule {}
