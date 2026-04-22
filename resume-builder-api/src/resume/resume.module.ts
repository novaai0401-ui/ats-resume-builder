import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { SettingsModule } from '../settings/settings.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [SettingsModule, BillingModule],
  providers: [ResumeService],
  controllers: [ResumeController],
  exports: [ResumeService],
})
export class ResumeModule {}