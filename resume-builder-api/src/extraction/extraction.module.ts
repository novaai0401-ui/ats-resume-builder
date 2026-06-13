import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ConfigModule, SettingsModule],
  providers: [ExtractionService],
  controllers: [ExtractionController],
  exports: [ExtractionService],
})
export class ExtractionModule {}
