import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { SupportRecoveryController } from './support-recovery.controller';
import { SelfServeRecoveryController } from './self-serve-recovery.controller';
import { MailStatusController } from './mail-status.controller';
import { WhatsappStatusController } from './whatsapp-status.controller';
import { AiStatusController } from './ai-status.controller';
import { AiHealthService } from './ai-health.service';
import { SupportRecoveryService } from './support-recovery.service';
import { SettingsModule } from '../settings/settings.module';
import { ResumeModule } from '../resume/resume.module';
import { BillingModule } from '../billing/billing.module';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
  imports: [SettingsModule, ResumeModule, BillingModule],
  controllers: [
    AdminController,
    AdminAnalyticsController,
    SupportRecoveryController,
    SelfServeRecoveryController,
    MailStatusController,
    WhatsappStatusController,
    AiStatusController,
  ],
  providers: [AdminAuthGuard, AdminBootstrapService, SupportRecoveryService, AiHealthService],
})
export class AdminModule {}
