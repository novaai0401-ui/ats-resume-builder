import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OutcomeNudgeController } from './outcome-nudge.controller';
import { OutcomeNudgeService } from './outcome-nudge.service';

@Module({
  imports: [MailModule],
  controllers: [OutcomeNudgeController],
  providers: [OutcomeNudgeService],
  exports: [OutcomeNudgeService],
})
export class OutcomeNudgeModule {}
