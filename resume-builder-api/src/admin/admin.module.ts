import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { SettingsModule } from '../settings/settings.module';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
  imports: [SettingsModule],
  controllers: [AdminController, AdminAnalyticsController],
  providers: [AdminAuthGuard, AdminBootstrapService],
})
export class AdminModule {}
