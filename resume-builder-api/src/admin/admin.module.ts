import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { SupportRecoveryController } from './support-recovery.controller';
import { SupportRecoveryService } from './support-recovery.service';
import { SettingsModule } from '../settings/settings.module';
import { ResumeModule } from '../resume/resume.module';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
  imports: [SettingsModule, ResumeModule],
  controllers: [AdminController, AdminAnalyticsController, SupportRecoveryController],
  providers: [AdminAuthGuard, AdminBootstrapService, SupportRecoveryService],
})
export class AdminModule {}
