import { ConfigService } from '@nestjs/config';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';

/**
 * Shared server-side (app-key) provider factory + plan helpers for the
 * post-pivot monetization model.
 *
 * Model (see REQUIREMENTS R-071):
 *  • Resume-upgrade AI: BYOK free, else OUR AI runs and a flat fee is
 *    added to that resume's download.
 *  • NON-resume AI (Mentor, Interview-Prep, Recruiter-sim, Skill-demand,
 *    Cover-letter): BYOK free, OR the single ₹499/mo plan unlocks OUR AI.
 *    With neither, the user gets the rule-based baseline + an upsell —
 *    our app key is NEVER spent for a free, key-less, plan-less user.
 */
export function serverGroqProvider(config: ConfigService): AiProvider | null {
  const providerName = config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
  if (providerName !== 'groq') return null;
  const key = config.get<string>('GROQ_API_KEY', '');
  if (!key) return null;
  const model = config.get<string>('GROQ_MODEL', '');
  return new GroqProvider(key, model || undefined);
}

/** The single paid plan is any non-FREE plan value (we reuse 'PRO' = ₹499/mo). */
export function isPlanActive(plan?: string | null): boolean {
  return Boolean(plan && plan !== 'FREE');
}

/** Copy shown when a non-resume AI feature has no BYOK key and no active plan. */
export const NON_RESUME_AI_UPSELL =
  'Add your own AI key in Settings (free) to use this now — or get the ₹499/mo plan to use our AI across every feature.';
