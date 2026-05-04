import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TechGapService } from './tech-gap.service';
import { CoverLetterService } from './cover-letter.service';
import { BulletRewriterService } from './bullet-rewriter.service';
import { JdMatchService } from './jd-match.service';
import { InterviewPrepService } from './interview-prep.service';
import { MentorChatService } from './mentor-chat.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ConfigModule, SettingsModule],
  controllers: [AiController],
  providers: [
    AiService,
    TechGapService,
    CoverLetterService,
    BulletRewriterService,
    JdMatchService,
    InterviewPrepService,
    MentorChatService,
  ],
  exports: [CoverLetterService],
})
export class AiModule {}
