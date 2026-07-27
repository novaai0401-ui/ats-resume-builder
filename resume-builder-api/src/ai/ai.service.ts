import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { enforceResumeAiFreeDaily, recordResumeAiFreeUsage, resolveResumeAiProvider } from './resume-ai-access';
import { XaiProvider } from './providers/xai.provider';
import { buildCritiquePrompt, type CritiquePromptInput } from './prompts/ats-critique.prompt';

/** Max experience bullets rewritten per free request. */
const FREE_MAX_BULLET_REWRITES = 5;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  async parseJd(userId: string, text: string) {
    rateLimitOrThrow({
      key: `ai:parse-jd:${userId}`,
      limit: 20,
      windowMs: 60_000,
      message: 'Rate limit exceeded for JD parsing.',
    });
    const tokens = estimateTokens(text);
    await this.checkAndCharge(userId, tokens);
    try {
      return await this.callAi('/ai/parse-jd', { text });
    } catch {
      return fallbackParseJd(text);
    }
  }

  async critiqueResume(userId: string, resumeText: string, jdText?: string) {
    rateLimitOrThrow({
      key: `ai:critique:${userId}`,
      limit: 10,
      windowMs: 60_000,
      message: 'Rate limit exceeded for resume critique.',
    });
    const payload = {
      resumeText: trimToMaxChars(resumeText, 4000),
      jdText: jdText ? trimToMaxChars(jdText, 3000) : undefined,
    };
    const tokens = estimateTokens(payload.resumeText) + estimateTokens(payload.jdText || '');
    await this.checkAndCharge(userId, tokens);
    try {
      return await this.callAi('/ai/critique', payload);
    } catch {
      return fallbackCritique(payload.resumeText);
    }
  }

  async skillGap(userId: string, resumeText: string, jdText: string) {
    rateLimitOrThrow({
      key: `ai:skill-gap:${userId}`,
      limit: 15,
      windowMs: 60_000,
      message: 'Rate limit exceeded for skill gap analysis.',
    });
    const payload = {
      resumeText: trimToMaxChars(resumeText, 4000),
      jdText: trimToMaxChars(jdText, 3000),
    };
    const tokens = estimateTokens(payload.resumeText) + estimateTokens(payload.jdText);
    await this.checkAndCharge(userId, tokens);
    try {
      return await this.callAi('/ai/skill-gap', payload);
    } catch {
      return fallbackSkillGap(payload.resumeText, payload.jdText);
    }
  }

  private async callAi(path: string, body: unknown) {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:7001');
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ForbiddenException(text || 'AI service error');
    }
    return res.json();
  }

  private async checkAndCharge(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('User not found');
    }
    // Per-plan token cap — protects the operator's Groq spend. A free/trial
    // user gets the FREE allowance (aiTokensLimit); a ₹499 plan user gets the
    // larger PRO allowance. Once the period allowance is spent, OUR-AI calls
    // are blocked (features fall back to rule-based / the upsell) so a trial
    // user can never run up an unbounded API bill. Reset each usage period.
    await ensureUsagePeriod(this.prisma, user);
    const updated = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!updated) {
      throw new ForbiddenException('User not found');
    }
    if (updated.aiTokensUsed + tokens > updated.aiTokensLimit) {
      throw new ForbiddenException(
        'AI usage limit reached for this period. Add your own AI key (free) in Settings, or upgrade to the ₹499 plan for a much larger allowance.',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { aiTokensUsed: updated.aiTokensUsed + tokens },
    });
  }

  /**
   * AI-powered ATS critique using configured provider (GROQ default).
   * Falls back to rule-based fallback if the provider fails or is unconfigured.
   */
  async aiCritique(userId: string, input: AiCritiqueInput, byok?: { provider?: string | null; key?: string | null; model?: string | null }): Promise<AiCritiqueResponse> {
    rateLimitOrThrow({
      key: `ai:ai-critique:${userId}`,
      limit: 5,
      windowMs: 60_000,
      message: 'Rate limit exceeded for AI critique. Try again shortly.',
    });

    const plan: 'free' | 'premium' = 'free';
    // Resume-page AI access (R-086): on the Edit Resume page OUR Groq key
    // powers AI Critique for EVERY user.
    //  • BYOK      → the user's own key (uncapped, no charge).
    //  • ₹499 plan → OUR AI (uncapped here; monthly PRO token budget applies).
    //  • FREE      → OUR AI too, capped to N actions/user/day (shared across
    //                all resume AI buttons). No ₹20 fee, no subscribe needed.
    const { provider, source } = await resolveResumeAiProvider(
      this.prisma, userId, byok, () => this.resolveProvider(),
    );
    const freeDaily = source === 'free';
    const entitled = source === 'byok' || source === 'plan'; // don't nag to add a key/subscribe

    // Only the FREE-on-our-key path is metered. BYOK (user's own key) and plan
    // users are never day-capped here. Enforce BEFORE spending a call.
    if (freeDaily) {
      await enforceResumeAiFreeDaily(this.prisma, this.config, userId, 'ats-critique');
    }

    if (!provider) {
      this.logger.warn('No eligible AI provider — returning rule-based critique');
      return this.buildFallbackCritique(input, plan, entitled);
    }

    const promptInput: CritiquePromptInput = {
      summary: input.summary || '',
      skills: input.skills || [],
      experience: (input.experience || []).map((e) => ({
        company: e.company || '',
        role: e.role || '',
        startDate: e.startDate || '',
        endDate: e.endDate || '',
        highlights: (e.highlights || []).filter(Boolean),
      })),
      education: (input.education || []).map((e) => ({
        institution: e.institution || '',
        degree: e.degree || '',
        startDate: e.startDate || '',
        endDate: e.endDate || '',
      })),
      jdText: input.jdText,
      atsWeaknesses: input.atsWeaknesses,
      missingKeywords: input.missingKeywords,
      currentScore: input.currentScore,
      plan,
    };

    const { system, user } = buildCritiquePrompt(promptInput);

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '30000'), 10);
      const raw = await provider.complete(system, user, {
        maxTokens: 4096,
        temperature: 0.3,
        timeoutMs,
      });

      const critique = parseAiCritiqueJson(raw, plan);
      // Count one free action against today's cap only on the free path.
      // BYOK / plan users are not metered here.
      if (freeDaily) {
        await recordResumeAiFreeUsage(this.prisma, userId, 'ats-critique');
      }

      return {
        success: true,
        provider: provider.name,
        plan,
        critique,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI critique failed (provider=${provider.name}): ${msg}`);
      return this.buildFallbackCritique(input, plan, entitled);
    }
  }

  /**
   * Resolve the configured AI provider. Returns null if none configured.
   */
  private resolveProvider(): AiProvider | null {
    const providerName = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (providerName === 'xai') {
      const key = this.config.get<string>('XAI_API_KEY', '');
      if (!key) return null;
      const model = this.config.get<string>('XAI_MODEL', '');
      return new XaiProvider(key, model || undefined);
    }
    // Default: groq
    const key = this.config.get<string>('GROQ_API_KEY', '');
    if (!key) return null;
    const model = this.config.get<string>('GROQ_MODEL', '');
    return new GroqProvider(key, model || undefined);
  }

  private buildFallbackCritique(
    input: AiCritiqueInput,
    plan: 'free' | 'premium',
    // True when the user already has AI access (BYOK key or a paid plan). We
    // must NOT nag them to "add a key or subscribe" — the fallback here means
    // OUR provider is momentarily unconfigured/failing, not that they lack
    // entitlement (R-084). Nagging an entitled user is the reported bug.
    entitled = false,
  ): AiCritiqueResponse {
    const issues: Array<{ type: string; severity: string; message: string }> = [];
    if (!input.summary || input.summary.trim().length < 50) {
      issues.push({ type: 'summary', severity: 'high', message: 'Add a detailed professional summary with role-specific keywords.' });
    }
    if (!input.skills || input.skills.length < 5) {
      issues.push({ type: 'skills', severity: 'high', message: 'List at least 5 relevant technical skills.' });
    }
    const allBullets = (input.experience || []).flatMap((e) => e.highlights || []).filter(Boolean);
    if (allBullets.length < 3) {
      issues.push({ type: 'experience', severity: 'high', message: 'Add measurable achievements with action verbs to experience bullets.' });
    }
    if (input.atsWeaknesses?.length) {
      for (const w of input.atsWeaknesses.slice(0, 3)) {
        issues.push({ type: 'formatting', severity: 'medium', message: w });
      }
    }

    return {
      success: true,
      provider: 'fallback',
      plan,
      critique: {
        summary: entitled
          ? 'Showing basic suggestions — our AI is momentarily unavailable, so here are rule-based checks. Please try the full critique again in a moment.'
          : 'Showing basic suggestions. Use our AI for a full critique (adds ₹20 to this resume’s download), add your own AI key in Settings (free), or get the ₹499/mo plan.',
        topIssues: issues,
        missingKeywords: input.missingKeywords?.slice(0, 8) || [],
        sectionSuggestions: { summary: [], skills: [], experience: [] },
        atsSafetyWarnings: ['Use standard section headers (Experience, Education, Skills).', 'Avoid tables, graphics, or multi-column layouts.'],
        estimatedImprovementBand: {
          current: input.currentScore != null ? String(input.currentScore) : 'unknown',
          possibleFree: entitled
            ? 'Retry for a full AI critique in a moment'
            : 'Add your own AI key (free) for tailored optimization',
          premium: entitled
            ? 'Full AI optimization is included with your access'
            : 'Full AI optimization with our AI (₹20/download) or the ₹499/mo plan',
        },
      },
    };
  }

  private async isPaymentFeatureEnabled() {
    if (!this.settingsService) return false;
    return this.settingsService.isPaymentFeatureEnabled();
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function trimToMaxChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function fallbackParseJd(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const skills = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);
  return { skills, responsibilities: [], seniority: 'mid' };
}

function fallbackCritique(resumeText: string) {
  const short = resumeText.replace(/\s+/g, ' ').trim();
  return {
    highlights: short ? [short.slice(0, 80)] : ['Add a concise summary at the top.'],
    weaknesses: ['Add measurable outcomes and role-specific keywords.'],
    rewrittenSummary: short.slice(0, 160),
  };
}

function fallbackSkillGap(resumeText: string, jdText: string) {
  const resumeTokens = new Set(
    resumeText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
  );
  const jdTokens = jdText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const missingSkills = Array.from(new Set(jdTokens)).filter((t) => !resumeTokens.has(t)).slice(0, 10);
  return { missingSkills, recommendedKeywords: missingSkills.slice(0, 6) };
}

// ─── AI Critique types ───────────────────────────────────────────────────────

export interface AiCritiqueInput {
  summary?: string;
  skills?: string[];
  experience?: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    startDate: string;
    endDate: string;
  }>;
  jdText?: string;
  atsWeaknesses?: string[];
  missingKeywords?: string[];
  currentScore?: number;
  /** Resume this critique is for — used to flag our-AI assist for the download fee. */
  resumeId?: string;
  /** Free, key-less, non-subscriber users must opt in to OUR AI (adds the ₹20 download fee). */
  aiOptIn?: boolean;
}

export interface AiCritiqueSuggestion {
  summary: string;
  topIssues: Array<{ type: string; severity: string; message: string }>;
  missingKeywords: string[];
  sectionSuggestions: {
    summary: string[];
    skills: string[];
    experience: Array<{
      expIndex: number;
      bulletIndex: number;
      original: string;
      suggested: string;
    }>;
  };
  atsSafetyWarnings: string[];
  estimatedImprovementBand: {
    current: string;
    possibleFree: string;
    premium: string;
  };
}

export interface AiCritiqueResponse {
  success: boolean;
  provider: string;
  plan: 'free' | 'premium';
  critique: AiCritiqueSuggestion;
}

/**
 * Defensively parse AI JSON response, handling malformed output.
 */
function parseAiCritiqueJson(raw: string, plan: 'free' | 'premium'): AiCritiqueSuggestion {
  let parsed: Record<string, unknown>;
  try {
    // Try direct parse first
    parsed = JSON.parse(raw);
  } catch {
    // Try to extract JSON from markdown code block or surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response contained no valid JSON');
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  const topIssues = Array.isArray(parsed.topIssues)
    ? parsed.topIssues.slice(0, 10).map((issue: Record<string, unknown>) => ({
        type: String(issue?.type || 'general'),
        severity: String(issue?.severity || 'medium'),
        message: String(issue?.message || ''),
      })).filter((i: { message: string }) => i.message)
    : [];

  const sectionSuggestions = parsed.sectionSuggestions as Record<string, unknown> || {};

  const expSuggestions = Array.isArray(sectionSuggestions.experience)
    ? sectionSuggestions.experience.slice(0, plan === 'free' ? FREE_MAX_BULLET_REWRITES : 20)
        .map((s: Record<string, unknown>) => ({
          expIndex: typeof s?.expIndex === 'number' ? s.expIndex : 0,
          bulletIndex: typeof s?.bulletIndex === 'number' ? s.bulletIndex : 0,
          original: String(s?.original || ''),
          suggested: String(s?.suggested || ''),
        })).filter((s: { suggested: string }) => s.suggested)
    : [];

  return {
    summary: String(parsed.summary || ''),
    topIssues,
    missingKeywords: Array.isArray(parsed.missingKeywords)
      ? parsed.missingKeywords.filter((k: unknown) => typeof k === 'string').slice(0, plan === 'free' ? 8 : 20)
      : [],
    sectionSuggestions: {
      summary: Array.isArray(sectionSuggestions.summary)
        ? sectionSuggestions.summary.filter((s: unknown) => typeof s === 'string').slice(0, plan === 'free' ? 1 : 3)
        : [],
      skills: Array.isArray(sectionSuggestions.skills)
        ? sectionSuggestions.skills.filter((s: unknown) => typeof s === 'string').slice(0, plan === 'free' ? 10 : 30)
        : [],
      experience: expSuggestions,
    },
    atsSafetyWarnings: Array.isArray(parsed.atsSafetyWarnings)
      ? parsed.atsSafetyWarnings.filter((w: unknown) => typeof w === 'string').slice(0, 5)
      : [],
    estimatedImprovementBand: {
      current: String((parsed.estimatedImprovementBand as Record<string, unknown>)?.current || ''),
      possibleFree: String((parsed.estimatedImprovementBand as Record<string, unknown>)?.possibleFree || 'up to ~90 with optimization'),
      premium: String((parsed.estimatedImprovementBand as Record<string, unknown>)?.premium || 'Deeper optimization available with premium'),
    },
  };
}
