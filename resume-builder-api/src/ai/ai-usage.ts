import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AiFeatureKey } from './free-trial';

/**
 * AI cost controls: model routing, usage recording, and the paid-plan monthly
 * token ceiling. The business context that shaped all three:
 *
 *   - AI is CHEAP but not free. A Groq 70B call costs ~Rs 0.2-0.35; an 8B call
 *     ~Rs 0.03. Routing the high-volume, low-stakes features to the small
 *     model cuts the AI bill ~70% with no visible quality change where it's
 *     applied.
 *   - "Uncapped for paid plans" is the right UX but a wrong absolute: one
 *     scripted abuser can turn the best-margin customer negative. The DB has
 *     always carried a per-user aiTokensLimit; this module finally enforces it
 *     for plan users, monthly.
 *   - The AiTokenUsage table existed with ZERO writers — the enforcement and
 *     the daily spend report are only as good as the recording, so record()
 *     is the third leg, not an afterthought.
 */

// ── 1. Model routing ────────────────────────────────────────────────────────

/**
 * Which features may run on the small/fast model. Chosen by stakes, not by
 * feature size: these either produce short structured output (plans, keyword
 * extraction) or drafts the user edits anyway (bullets). Features that ship
 * user-visible PROSE (critique, cover letters, LinkedIn rewrites, mentor chat)
 * stay on the heavy model, where writing quality shows.
 */
const LIGHT_MODEL_FEATURES: ReadonlySet<AiFeatureKey> = new Set<AiFeatureKey>([
  'profile-copilot',
  'bullet-rewrite',
  'jd-match',
  'skill-demand',
]);

/**
 * Resolve the Groq model for a feature. Overridable per deployment:
 *   AI_MODEL_LIGHT  small/fast model  (default llama-3.1-8b-instant)
 *   GROQ_MODEL      heavy model       (existing var, provider default if unset)
 * Returning undefined lets the provider use its own default.
 */
export function modelForFeature(config: ConfigService, feature: AiFeatureKey): string | undefined {
  if (LIGHT_MODEL_FEATURES.has(feature)) {
    return config.get<string>('AI_MODEL_LIGHT', 'llama-3.1-8b-instant') || undefined;
  }
  return config.get<string>('GROQ_MODEL', '') || undefined;
}

// ── 2. Usage recording ──────────────────────────────────────────────────────

/**
 * Rough token estimate for services that don't get exact counts back.
 * chars/4 is the standard English approximation; good enough for a ceiling
 * and a spend report, useless for billing — which is fine, we don't bill on it.
 */
export function approxTokens(...texts: Array<string | null | undefined>): number {
  const chars = texts.reduce((n, t) => n + (t ? t.length : 0), 0);
  return Math.max(1, Math.ceil(chars / 4));
}

/**
 * Record one AI call. Never throws — a metering failure must not fail the
 * user's request (the call already succeeded and cost the money either way).
 */
export async function recordAiUsage(
  prisma: PrismaService,
  args: { userId: string; feature: AiFeatureKey; tokensUsed: number; model?: string | null },
): Promise<void> {
  try {
    await prisma.aiTokenUsage.create({
      data: {
        userId: args.userId,
        featureType: args.feature,
        tokensUsed: Math.max(0, Math.round(args.tokensUsed)),
        modelUsed: args.model || null,
      },
    });
  } catch {
    /* metering is best-effort by design */
  }
}

// ── 3. Paid-plan monthly ceiling ────────────────────────────────────────────

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Enforce the plan user's monthly token quota (User.aiTokensLimit — set by
 * the upgrade path and by admin grants). Call ONLY on the 'plan' path: BYOK
 * costs us nothing and FREE has its own daily cap.
 *
 * The limit lives on the user row rather than in config, so a comped account,
 * a STUDENT and a PRO can all carry different ceilings without a deploy.
 */
export async function enforcePlanMonthlyTokens(
  prisma: PrismaService,
  userId: string,
): Promise<{ used: number; limit: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiTokensLimit: true, plan: true },
  });
  const limit = user?.aiTokensLimit ?? 0;
  // A zero/absent limit means "not configured" — fail open rather than
  // bricking every paid account over a missing column value.
  if (!limit) return { used: 0, limit: 0 };

  const agg = await prisma.aiTokenUsage.aggregate({
    where: { userId, createdAt: { gte: startOfMonth() } },
    _sum: { tokensUsed: true },
  });
  const used = agg._sum.tokensUsed ?? 0;
  if (used >= limit) {
    throw new ForbiddenException(
      `You've used this month's included AI (${limit.toLocaleString()} tokens on the ${user?.plan} plan). ` +
        'It resets on the 1st — or add your own AI key in Settings for unlimited use at no extra cost.',
    );
  }
  return { used, limit };
}
