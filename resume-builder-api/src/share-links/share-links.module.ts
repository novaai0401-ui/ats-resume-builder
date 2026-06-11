import { Module } from '@nestjs/common';
import { ResumeModule } from '../resume/resume.module';
import { PublicShareLinkController, ShareLinksController } from './share-links.controller';
import { ShareLinksService } from './share-links.service';

@Module({
  imports: [ResumeModule],
  controllers: [ShareLinksController, PublicShareLinkController],
  providers: [ShareLinksService],
  exports: [ShareLinksService],
})
export class ShareLinksModule {}
