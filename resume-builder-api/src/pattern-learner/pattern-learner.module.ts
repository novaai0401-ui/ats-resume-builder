import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PatternLearnerController } from './pattern-learner.controller';
import { PatternLearnerService } from './pattern-learner.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
  imports: [ConfigModule],
  controllers: [PatternLearnerController],
  providers: [PatternLearnerService, AdminAuthGuard],
  exports: [PatternLearnerService],
})
export class PatternLearnerModule {}
