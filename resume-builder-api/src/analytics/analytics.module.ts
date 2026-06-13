import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * Global so any controller — auth today, billing / resume / admin
 * tomorrow — can inject AnalyticsService without re-importing the
 * module. There is exactly one sink for the whole API.
 */
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
