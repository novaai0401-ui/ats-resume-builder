import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { buildByokProvider } from './providers/byok-factory';
import { isPlanActive } from './server-provider';

/**
 * R-086 — Resume-page AI access policy.
 *
 * On the Edit Resume page ONLY, OUR Groq key powers every AI feature
 * (Critique, Rewrite, Scan job skills / JD-match, Tech Gap, Tailor) for
 * ALL users:
 *   • BYOK      → the user's own key (uncapped from our side).
 *   • ₹499 plan → our key, uncapped here (protected by the monthly PRO
 *                 token budget).
 *   • FREE      → our key too, but capped to N AI actions per user per day
 *                 (default 10) so a free user can't exhaust our Groq
 *                 allowance in a single day.
 *
 * Everywhere OFF this page (Coach, Mentor, Chat, Interview, etc.) none of
 * this applies — those features stay BYOK-or-subscribe and never spend our
 * key for a free user.
 *
 * The daily counter reuses the existing `AiCritiqueLog` table (one row per
 * free our-AI action) so there is no schema migration; the cap is shared
 * across every resume AI button combined.
 */

export const RESUME_AI_FREE_DAILY_LIMIT_DEFAULT = 10;

/** Which key a resume-page AI call routes to. */
export type ResumeAiSource = 'byok' | 'plan' | 'free' | null;

export type ResumeAiResolution = {
  provider: AiProvider | null;
  source: ResumeAiSource;
};

export type ByokHeaders = { provider?: string | null; key?: string | null; model?: string | null };

/**
 * Decide which AI provider a resume-page call uses, per user state:
 *   • the user added their own key (BYOK)  → their key   (source 'byok')
 *   • the user subscribed (₹499 plan)       → OUR key     (source 'plan')
 *   • free user                             → OUR key     (source 'free', day-capped)
 *   • no server key configured at all       → null        (caller falls back)
 *
 * `buildOurProvider` is the caller's own server-provider builder (so a service
 * that supports extra providers, e.g. xAI, keeps that) — it's only invoked for
 * the plan/free paths, never for BYOK. The BYOK path is honoured FIRST so an
 * own-key user never touches our key.
 */
export async function resolveResumeAiProvider(
  prisma: PrismaService,
  userId: string,
  byok: ByokHeaders | undefined,
  buildOurProvider: () => AiProvider | null,
): Promise<ResumeAiResolution> {
  const byokProvider = buildByokProvider(byok?.provider, byok?.key, byok?.model);
  if (byokProvider) return { provider: byokProvider, source: 'byok' };

  const our = buildOurProvider();
  if (!our) return { provider: null, source: null };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return { provider: our, source: isPlanActive(user?.plan) ? 'plan' : 'free' };
}

/** Per-user daily cap for FREE users on our Groq key. Tunable via env. */
export function resumeAiFreeDailyLimit(config: ConfigService): number {
  const raw = parseInt(
    config.get<string>('AI_FREE_MAX_REQUESTS_PER_DAY', String(RESUME_AI_FREE_DAILY_LIMIT_DEFAULT)),
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : RESUME_AI_FREE_DAILY_LIMIT_DEFAULT;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Throw if a FREE user has already spent their daily our-AI actions. Only
 * call this on the free path (never for BYOK or plan users). C-004: a typed
 * exception naming the quota and the remediation (BYOK / plan / wait).
 */
export async function enforceResumeAiFreeDaily(
  prisma: PrismaService,
  config: ConfigService,
  userId: string,
): Promise<void> {
  const max = resumeAiFreeDailyLimit(config);
  const count = await prisma.aiCritiqueLog.count({
    where: { userId, createdAt: { gte: startOfToday() } },
  });
  if (count >= max) {
    throw new ForbiddenException(
      `You've used your ${max} free AI actions for today. Add your own AI key in Settings (free), ` +
      'or get the ₹499/mo plan for unlimited — or try again tomorrow.',
    );
  }
}

/**
 * Record one free our-AI action against today's quota. Best-effort: never
 * fail the AI response over the usage log. Only call on the free path.
 */
export async function recordResumeAiFreeUsage(prisma: PrismaService, userId: string): Promise<void> {
  try {
    await prisma.aiCritiqueLog.create({ data: { userId } });
  } catch {
    // Non-critical — a lost log row just means one uncounted free action.
  }
}
