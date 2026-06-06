import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { SupportController } from './support.controller';
import { SettingsModule } from '../settings/settings.module';
import { ResumeModule } from '../resume/resume.module';
import { MailModule } from '../mail/mail.module';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
  imports: [SettingsModule, ResumeModule, MailModule],
  controllers: [AdminController, AdminAnalyticsController, SupportController],
  providers: [AdminAuthGuard, AdminBootstrapService],
})
export class AdminModule {}
