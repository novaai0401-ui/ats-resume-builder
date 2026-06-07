import { Module } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { PortfolioController, PublicPortfolioController } from './portfolio.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [PortfolioService],
  controllers: [PortfolioController, PublicPortfolioController],
  exports: [PortfolioService],
})
export class PortfolioModule {}
