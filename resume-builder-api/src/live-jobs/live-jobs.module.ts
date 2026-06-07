import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LiveJobsService } from './live-jobs.service';

@Module({
  imports: [ConfigModule],
  providers: [LiveJobsService],
  exports: [LiveJobsService],
})
export class LiveJobsModule {}
