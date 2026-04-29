import { Module } from '@nestjs/common';
import { AppMetaController } from './app-meta.controller';

@Module({
  controllers: [AppMetaController],
})
export class AppMetaModule {}
