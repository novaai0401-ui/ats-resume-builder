import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OutcomeNudgeController } from './outcome-nudge.controller';
import { OutcomeNudgeService } from './outcome-nudge.service';
import { InboundMailService } from './inbound-mail.service';
import { InboundOutcomeMailController } from './outcome-nudge.controller';

@Module({
  imports: [MailModule],
  controllers: [OutcomeNudgeController, InboundOutcomeMailController],
  providers: [OutcomeNudgeService, InboundMailService],
  exports: [OutcomeNudgeService, InboundMailService],
})
export class OutcomeNudgeModule {}
