import { Module } from '@nestjs/common';
import { TrainingDatasetController } from './training-dataset.controller';
import { TrainingDatasetService } from './training-dataset.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
  controllers: [TrainingDatasetController],
  providers: [TrainingDatasetService, AdminAuthGuard],
  exports: [TrainingDatasetService],
})
export class TrainingDatasetModule {}
