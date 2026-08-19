import { Module } from '@nestjs/common';
import { LiveJobsModule } from '../live-jobs/live-jobs.module';
import { ResumeModule } from '../resume/resume.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  // Both back GET /jobs/matches/:resumeId, which derives a search query from a
  // saved resume and runs it against the live feeds.
  imports: [LiveJobsModule, ResumeModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
