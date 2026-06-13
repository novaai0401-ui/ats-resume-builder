import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestSignatureMiddleware } from './auth/request-signature.middleware';
import { AuthModule } from './auth/auth.module';
import { ResumeModule } from './resume/resume.module';
import { PrismaModule } from './prisma/prisma.module';
import { AiModule } from './ai/ai.module';
import { BillingModule } from './billing/billing.module';
import { HealthController } from './health/health.controller';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { CompaniesModule } from './companies/companies.module';
import { MetaModule } from './meta/meta.module';
import { SettingsModule } from './settings/settings.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';
import { JobsModule } from './jobs/jobs.module';
import { AppMetaModule } from './app-meta/app-meta.module';
import { PatternLearnerModule } from './pattern-learner/pattern-learner.module';
import { SahaayakModule } from './sahaayak/sahaayak.module';
import { TrainingDatasetModule } from './training-dataset/training-dataset.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ExtractionModule } from './extraction/extraction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env.local',
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env',
      ],
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    SettingsModule,
    ResumeModule,
    AdminModule,
    IntelligenceModule,
    AiModule,
    BillingModule,
    CompaniesModule,
    MetaModule,
    JobsModule,
    AppMetaModule,
    PatternLearnerModule,
    SahaayakModule,
    TrainingDatasetModule,
    PortfolioModule,
    ExtractionModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestSignatureMiddleware).forRoutes('*');
  }
}
