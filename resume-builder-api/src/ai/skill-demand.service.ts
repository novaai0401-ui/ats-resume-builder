import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import {
  analyzeSkillsRuleBased,
  TOP_IN_DEMAND_2026,
  type SkillDemand,
} from './skill-demand-data';

/**
 * Skill-Demand Agent.
 *
 * On resume upload (or on demand) we extract skills and tell the user which
 * technologies are hot right now, what to learn next, and which companies hire
 * for them.
 *
 *  • FREE users: a distilled, curated 2026 snapshot (never blocked) plus an
 *    upsell to real-time, AI-personalized analysis.
 *  • STUDENT/PRO: an LLM pass that personalizes the assessment to the user's
 *    exact stack. (True live web search needs an external search API; until
 *    that's wired, the AI path uses the model's knowledge — still personalized
 *    and far richer than the static table.)
 */

export type SkillDemandInput = {
  skills: string[];
};

export type SkillDemandResult = {
  /** True when the analysis is AI-personalized; false for the static fallback. */
  realtime: boolean;
  /** Upsell / context message shown under the results. */
  message: string;
  topInDemand: string[];
  yourSkills: SkillDemand[];
  provider: 'groq' | 'rule-based';
};

const APPROX_TOKENS = 700;
const UPSELL =
  'Showing our curated 2026 trends. Subscribe to Student or Pro for real-time, ' +
  'AI-personalized demand analysis and live openings matched to your exact skills.';
const PAID_NOTE = 'AI-personalized to your stack. Verify live openings on the linked job boards.';

@Injectable()
export class SkillDemandService {
  private readonly logger = new Logger(SkillDemandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async analyze(userId: string, input: SkillDemandInput): Promise<SkillDemandResult> {
    const skills = Array.isArray(input?.skills) ? input.skills.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (skills.length === 0) {
      throw new ForbiddenException('Add at least one skill to analyze.');
    }

    rateLimitOrThrow({
      key: `ai:skill-demand:${userId}`,
      limit: 20,
      windowMs: 60_000,
      message: 'Rate limit exceeded for skill demand. Try again shortly.',
    });

    // Always compute the rule-based snapshot — it's the free deliverable AND a
    // guaranteed fallback for paid users when the LLM is unavailable.
    const baseline = analyzeSkillsRuleBased(skills);

    const paid = await this.isPaidUser(userId);
    if (!paid) {
      return { realtime: false, message: UPSELL, topInDemand: TOP_IN_DEMAND_2026, yourSkills: baseline, provider: 'rule-based' };
    }

    await this.chargeTokens(userId, APPROX_TOKENS);
    const provider = this.resolveProvider();
    if (!provider) {
      return { realtime: false, message: UPSELL, topInDemand: TOP_IN_DEMAND_2026, yourSkills: baseline, provider: 'rule-based' };
    }

    const system = [
      'You are a tech labor-market analyst. Given a candidate\'s skills, assess current demand.',
      'Return JSON with this exact shape and nothing else:',
      '{ "topInDemand": string[], "yourSkills": [ { "skill": string, "demand": "very-high"|"high"|"moderate"|"stable",',
      '  "trend": string, "alsoLearn": string[], "companiesHiring": string[] } ] }',
      'Rules:',
      '  • topInDemand: 6-10 hottest skills in the broader market right now.',
      '  • For each input skill, give a realistic demand level, a one-line trend,',
      '    2-3 adjacent skills to learn, and 3-5 real companies known to hire for it',
      '    (favor companies relevant to India when plausible).',
      '  • Be honest; do not inflate demand. Do not invent company names.',
    ].join('\n');

    const userPrompt = `CANDIDATE SKILLS:\n${skills.join(', ')}`;

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '25000'), 10);
      const raw = await provider.complete(system, userPrompt, { maxTokens: 1100, temperature: 0.3, timeoutMs });
      const parsed = parseSkillDemandResponse(raw);
      if (!parsed || !parsed.yourSkills?.length) {
        return { realtime: false, message: UPSELL, topInDemand: TOP_IN_DEMAND_2026, yourSkills: baseline, provider: 'rule-based' };
      }
      return {
        realtime: true,
        message: PAID_NOTE,
        topInDemand: parsed.topInDemand?.length ? parsed.topInDemand.slice(0, 10) : TOP_IN_DEMAND_2026,
        yourSkills: parsed.yourSkills.slice(0, 15),
        provider: 'groq',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Skill demand failed (provider=${provider.name}): ${msg}`);
      return { realtime: false, message: UPSELL, topInDemand: TOP_IN_DEMAND_2026, yourSkills: baseline, provider: 'rule-based' };
    }
  }

  private async isPaidUser(userId: string): Promise<boolean> {
    const paymentFeatureEnabled = await this.settingsService.isPaymentFeatureEnabled();
    if (!paymentFeatureEnabled) return true; // payments off → treat everyone as unlocked
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    return Boolean(user && user.plan !== 'FREE');
  }

  private async chargeTokens(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    await ensureUsagePeriod(this.prisma, user);
    const updated = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!updated) throw new ForbiddenException('User not found');
    if (updated.aiTokensUsed + tokens > updated.aiTokensLimit) {
      throw new ForbiddenException('AI usage limit exceeded for this period.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { aiTokensUsed: updated.aiTokensUsed + tokens } });
  }

  private resolveProvider(): AiProvider | null {
    const providerName = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (providerName !== 'groq') return null;
    const key = this.config.get<string>('GROQ_API_KEY', '');
    if (!key) return null;
    const model = this.config.get<string>('GROQ_MODEL', '');
    return new GroqProvider(key, model || undefined);
  }
}

// ── Helpers (exported for tests) ────────────────────────────────────

const VALID_DEMAND = new Set(['very-high', 'high', 'moderate', 'stable']);

export function parseSkillDemandResponse(raw: string): Partial<SkillDemandResult> | null {
  if (!raw || typeof raw !== 'string') return null;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(first, last + 1));
  } catch {
    return null;
  }
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  const yourSkills = Array.isArray(obj.yourSkills)
    ? obj.yourSkills
        .map((s) => {
          const row = s as Record<string, unknown>;
          const skill = String(row?.skill ?? '').trim();
          if (!skill) return null;
          const demand = VALID_DEMAND.has(String(row?.demand)) ? (row.demand as SkillDemand['demand']) : 'stable';
          return {
            skill,
            demand,
            trend: String(row?.trend ?? '').trim() || 'Demand assessed by AI.',
            alsoLearn: asStrings(row?.alsoLearn).slice(0, 4),
            companiesHiring: asStrings(row?.companiesHiring).slice(0, 5),
          } as SkillDemand;
        })
        .filter((x): x is SkillDemand => x !== null)
    : [];
  return { topInDemand: asStrings(obj.topInDemand), yourSkills };
}
