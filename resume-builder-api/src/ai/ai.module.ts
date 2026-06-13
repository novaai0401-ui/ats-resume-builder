import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TechGapService } from './tech-gap.service';
import { CoverLetterService } from './cover-letter.service';
import { BulletRewriterService } from './bullet-rewriter.service';
import { TailorService } from './tailor.service';
import { JdMatchService } from './jd-match.service';
import { InterviewPrepService } from './interview-prep.service';
import { MentorChatService } from './mentor-chat.service';
import { RecruiterSimService } from './recruiter-sim.service';
import { SkillDemandService } from './skill-demand.service';
import { SettingsModule } from '../settings/settings.module';
import { LiveJobsModule } from '../live-jobs/live-jobs.module';

@Module({
  imports: [ConfigModule, SettingsModule, LiveJobsModule],
  controllers: [AiController],
  providers: [
    AiService,
    TechGapService,
    CoverLetterService,
    BulletRewriterService,
    TailorService,
    JdMatchService,
    InterviewPrepService,
    MentorChatService,
    RecruiterSimService,
    SkillDemandService,
  ],
  exports: [CoverLetterService],
})
export class AiModule {}
