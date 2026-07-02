import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PatternLearnerController } from './pattern-learner.controller';
import { PatternLearnerService } from './pattern-learner.service';
import { PatternModelService } from './pattern-model.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
  imports: [ConfigModule],
  controllers: [PatternLearnerController],
  providers: [PatternLearnerService, PatternModelService, AdminAuthGuard],
  exports: [PatternLearnerService, PatternModelService],
})
export class PatternLearnerModule {}
