import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { ResumeVersionsService } from './resume-versions.service';
import { OutcomesService } from './outcomes.service';
import { SettingsModule } from '../settings/settings.module';
import { BillingModule } from '../billing/billing.module';
import { PatternLearnerModule } from '../pattern-learner/pattern-learner.module';

@Module({
  imports: [SettingsModule, BillingModule, PatternLearnerModule],
  providers: [ResumeService, ResumeVersionsService, OutcomesService],
  controllers: [ResumeController],
  exports: [ResumeService, ResumeVersionsService, OutcomesService],
})
export class ResumeModule {}