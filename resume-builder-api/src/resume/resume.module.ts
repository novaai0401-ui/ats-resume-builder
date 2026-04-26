import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { ResumeVersionsService } from './resume-versions.service';
import { SettingsModule } from '../settings/settings.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [SettingsModule, BillingModule],
  providers: [ResumeService, ResumeVersionsService],
  controllers: [ResumeController],
  exports: [ResumeService, ResumeVersionsService],
})
export class ResumeModule {}