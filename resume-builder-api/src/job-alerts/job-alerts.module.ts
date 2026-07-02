import { Module } from '@nestjs/common';
import { LiveJobsModule } from '../live-jobs/live-jobs.module';
import { JobAlertsController } from './job-alerts.controller';
import { JobAlertsService } from './job-alerts.service';

@Module({
  imports: [LiveJobsModule],
  controllers: [JobAlertsController],
  providers: [JobAlertsService],
  exports: [JobAlertsService],
})
export class JobAlertsModule {}
