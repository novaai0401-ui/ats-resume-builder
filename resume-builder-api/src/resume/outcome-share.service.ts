import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutcomesService } from './outcomes.service';
import { buildOutcomeCard, signOutcomeCard, verifyOutcomeCard, type OutcomeCard } from './outcome-share';

/**
 * Glue for the shareable Outcome Card. Owns secret resolution so both the
 * authenticated "create link" path and the public "read card" path agree on
 * the signing key. Prefers a dedicated OUTCOME_SHARE_SECRET; falls back to
 * JWT_SECRET so the feature works out of the box in every environment that
 * already has auth configured.
 */
@Injectable()
export class OutcomeShareService {
  constructor(
    private readonly outcomes: OutcomesService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    return (
      this.config.get<string>('OUTCOME_SHARE_SECRET', '') ||
      this.config.get<string>('JWT_SECRET', 'dev_secret')
    );
  }

  /** Build a fresh anonymized snapshot card and return its signed token. */
  async createToken(userId: string, resumeId: string): Promise<{ token: string }> {
    const report = await this.outcomes.forResume(userId, resumeId);
    const card = buildOutcomeCard(report);
    return { token: signOutcomeCard(card, this.secret()) };
  }

  /** Verify + decode a public token. Returns null if invalid/tampered. */
  readCard(token: string): OutcomeCard | null {
    return verifyOutcomeCard(token, this.secret());
  }
}
