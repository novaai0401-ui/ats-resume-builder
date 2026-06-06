import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { OutcomeShareService } from './outcome-share.service';

/**
 * Public, unauthenticated read surface for shared Outcome Cards.
 *
 * Deliberately NOT behind JwtAuthGuard — a brag link must open for anyone the
 * user sends it to. Safe to expose because the token is self-contained and
 * carries only anonymized numbers; an invalid or tampered token resolves to
 * a 404 rather than leaking whether a given card ever existed.
 */
@Controller('public')
export class PublicShareController {
  constructor(private readonly shareService: OutcomeShareService) {}

  @Get('outcome-card/:token')
  outcomeCard(@Param('token') token: string) {
    const card = this.shareService.readCard(token);
    if (!card) throw new NotFoundException('This share link is invalid or has expired.');
    return card;
  }
}
