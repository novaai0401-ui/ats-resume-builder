import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SahaayakController } from './sahaayak.controller';
import { SahaayakService } from './sahaayak.service';

@Module({
  imports: [ConfigModule],
  controllers: [SahaayakController],
  providers: [SahaayakService],
  exports: [SahaayakService],
})
export class SahaayakModule {}
