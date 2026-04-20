import { Module } from '@nestjs/common';
import { QuantumController } from './quantum.controller';
import { QuantumService } from './quantum.service';

@Module({
  controllers: [QuantumController],
  providers: [QuantumService],
  exports: [QuantumService],
})
export class QuantumModule {}
