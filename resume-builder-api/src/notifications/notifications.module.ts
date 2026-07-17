import { Global, Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

/**
 * R-087 — optional notification channels beyond email. Global (same as
 * MailModule) so the additive WhatsApp channel can be injected anywhere
 * without per-module wiring; it is a silent no-op when unconfigured.
 */
@Global()
@Module({
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class NotificationsModule {}
