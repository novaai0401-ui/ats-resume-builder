import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { ResumeVersionsService } from './resume-versions.service';
import { SettingsModule } from '../settings/settings.module';
import { BillingModule } from '../billing/billing.module';
import { PatternLearnerModule } from '../pattern-learner/pattern-learner.module';

@Module({
  imports: [SettingsModule, BillingModule, PatternLearnerModule],
  providers: [ResumeService, ResumeVersionsService],
  controllers: [ResumeController],
  exports: [ResumeService, ResumeVersionsService],
})
export class ResumeModule {}