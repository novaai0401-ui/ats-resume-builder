import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TechGapService } from './tech-gap.service';
import { CoverLetterService } from './cover-letter.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ConfigModule, SettingsModule],
  controllers: [AiController],
  providers: [AiService, TechGapService, CoverLetterService],
  exports: [CoverLetterService],
})
export class AiModule {}
