import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { ResumeVersionsService } from './resume-versions.service';
import { OutcomesService } from './outcomes.service';
import { OutcomeShareService } from './outcome-share.service';
import { PublicShareController } from './public-share.controller';
import { SettingsModule } from '../settings/settings.module';
import { BillingModule } from '../billing/billing.module';
import { PatternLearnerModule } from '../pattern-learner/pattern-learner.module';
import { TrainingDatasetModule } from '../training-dataset/training-dataset.module';

@Module({
  imports: [SettingsModule, BillingModule, PatternLearnerModule, TrainingDatasetModule],
  providers: [ResumeService, ResumeVersionsService, OutcomesService, OutcomeShareService],
  controllers: [ResumeController, PublicShareController],
  exports: [ResumeService, ResumeVersionsService, OutcomesService],
})
export class ResumeModule {}