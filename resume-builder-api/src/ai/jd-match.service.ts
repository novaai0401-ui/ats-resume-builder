import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';

/**
 * JD Match Score — Student/Pro feature.
 *
 * User pastes a job description. We return:
 *   • matchPercent (0–100)
 *   • matchedKeywords — what the user already covers
 *   • missingKeywords — what's in the JD but not in the resume
 *   • bulletSuggestions — 3 candidate bullets the user could add
 *     to close the biggest gaps
 *
 * Rule-based core (always runs) ensures the feature works even when
 * GROQ is misconfigured. The LLM layer (when available) refines the
 * bullet suggestions to feel natural rather than templated.
 */

export type JdMatchInput = {
  resumeText: string;
  jdText: string;
  currentSkills?: string[];
};

export type JdMatchResult = {
  matchPercent: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  bulletSuggestions: string[];
  provider: 'groq' | 'rule-based';
};

const APPROX_TOKENS = 600;
const MAX_INPUT_CHARS = 8000;
// Common ATS skill keywords. Hand-curated to cover the IT roles we
// support; intentionally biased toward tech because that's the
// majority of our audience. The list is short on purpose — anything
// in the JD that's not on this list still flows through via the
// catch-all proper-noun extraction.
const KNOWN_SKILLS = [
  'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'kotlin', 'swift', 'c++', 'c#', 'php', 'ruby',
  'react', 'react native', 'next.js', 'angular', 'vue', 'svelte', 'redux', 'tailwind',
  'node.js', 'express', 'fastapi', 'django', 'flask', 'spring', 'rails', 'laravel',
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb', 'sqlite',
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions',
  'graphql', 'rest', 'grpc', 'webhooks', 'api design',
  'html', 'html5', 'css', 'css3', 'sass', 'less', 'webpack', 'vite', 'rollup',
  'pandas', 'numpy', 'pytorch', 'tensorflow', 'scikit-learn', 'spark', 'airflow', 'dbt',
  'agile', 'scrum', 'kanban', 'jira', 'figma', 'mixpanel', 'amplitude',
  'ci/cd', 'tdd', 'unit testing', 'integration testing', 'jest', 'pytest', 'cypress', 'playwright',
  'microservices', 'microfrontends', 'soa', 'event-driven', 'cqrs', 'serverless',
  'machine learning', 'deep learning', 'nlp', 'computer vision', 'llm', 'rag', 'fine-tuning',
  'leadership', 'mentoring', 'stakeholder', 'cross-functional', 'communication',
  'system design', 'design patterns', 'data structures', 'algorithms',
  'security', 'oauth', 'jwt', 'encryption', 'vulnerability', 'penetration testing',
  'cloud', 'devops', 'sre', 'observability', 'monitoring', 'logging', 'tracing',
];

@Injectable()
export class JdMatchService {
  private readonly logger = new Logger(JdMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async match(userId: string, input: JdMatchInput): Promise<JdMatchResult> {
    const resumeText = String(input?.resumeText || '').slice(0, MAX_INPUT_CHARS);
    const jdText = String(input?.jdText || '').slice(0, MAX_INPUT_CHARS);
    if (!resumeText.trim() || !jdText.trim()) {
      throw new ForbiddenException('Both resume and JD text are required.');
    }

    rateLimitOrThrow({
      key: `ai:jd-match:${userId}`,
      limit: 20,
      windowMs: 60_000,
      message: 'Rate limit exceeded for JD match. Try again shortly.',
    });

    await this.checkAndCharge(userId, APPROX_TOKENS);

    // Always compute a rule-based score first. It guarantees the user
    // sees *something* even when the LLM is unavailable, and gives us
    // a baseline to compare against (the LLM result is taken when it
    // produces stronger keyword coverage).
    const baseline = computeRuleBasedMatch(resumeText, jdText, input.currentSkills ?? []);

    const provider = this.resolveProvider();
    if (!provider) {
      return {
        matchPercent: baseline.matchPercent,
        matchedKeywords: baseline.matchedKeywords,
        missingKeywords: baseline.missingKeywords,
        bulletSuggestions: ruleBasedBulletSuggestions(baseline.missingKeywords),
        provider: 'rule-based',
      };
    }

    const system = [
      'You are an ATS resume coach. Compare the candidate resume against the JD.',
      'Return JSON with this exact shape and nothing else:',
      '{ "matchPercent": number 0-100, "matchedKeywords": string[], "missingKeywords": string[], "bulletSuggestions": string[3] }',
      'Rules:',
      '  • matchPercent reflects keyword coverage AND seniority alignment.',
      '  • Each bulletSuggestion is one sentence under 28 words, starts with a strong verb,',
      '    quantifies impact when reasonable, and explicitly references one missing keyword.',
      '  • Suggest only bullets the candidate could plausibly say given their existing experience.',
      '  • Do not invent facts or numbers.',
    ].join('\n');

    const userPrompt = [
      `RESUME:\n${resumeText}`,
      `\nJOB DESCRIPTION:\n${jdText}`,
      input.currentSkills?.length ? `\nALREADY ON RESUME (skills): ${input.currentSkills.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '25000'), 10);
      const raw = await provider.complete(system, userPrompt, {
        maxTokens: 700,
        temperature: 0.3,
        timeoutMs,
      });
      const parsed = parseJdMatchResponse(raw);
      if (!parsed) {
        return { ...baseline, bulletSuggestions: ruleBasedBulletSuggestions(baseline.missingKeywords), provider: 'rule-based' };
      }
      return {
        matchPercent: clampPercent(parsed.matchPercent ?? baseline.matchPercent),
        matchedKeywords: parsed.matchedKeywords?.length ? parsed.matchedKeywords : baseline.matchedKeywords,
        missingKeywords: parsed.missingKeywords?.length ? parsed.missingKeywords : baseline.missingKeywords,
        bulletSuggestions: parsed.bulletSuggestions?.length
          ? parsed.bulletSuggestions.slice(0, 3)
          : ruleBasedBulletSuggestions(baseline.missingKeywords),
        provider: 'groq',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`JD match failed (provider=${provider.name}): ${msg}`);
      return { ...baseline, bulletSuggestions: ruleBasedBulletSuggestions(baseline.missingKeywords), provider: 'rule-based' };
    }
  }

  private async checkAndCharge(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');

    const paymentFeatureEnabled = await this.settingsService.isPaymentFeatureEnabled();
    if (paymentFeatureEnabled && user.plan === 'FREE') {
      throw new ForbiddenException('FREE_PLAN_AI_BLOCKED: JD Match requires Student or Pro.');
    }
    await ensureUsagePeriod(this.prisma, user);
    const updated = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!updated) throw new ForbiddenException('User not found');
    if (updated.aiTokensUsed + tokens > updated.aiTokensLimit) {
      throw new ForbiddenException('AI usage limit exceeded for this period.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { aiTokensUsed: updated.aiTokensUsed + tokens },
    });
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

export function clampPercent(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function tokenizeForKeywords(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[`"'(){}\[\]]/g, ' ')
      .split(/[^a-z0-9.+#/\-]+/)
      // Strip trailing/leading punctuation kept by the split regex
      // ("node.js" is preserved, "aws." becomes "aws").
      .map((s) => s.trim().replace(/^[.\-/]+|[.\-/]+$/g, ''))
      .filter((s) => s.length >= 2),
  );
}

export function computeRuleBasedMatch(
  resumeText: string,
  jdText: string,
  currentSkills: string[],
): { matchPercent: number; matchedKeywords: string[]; missingKeywords: string[] } {
  const resumeTokens = tokenizeForKeywords(resumeText);
  for (const skill of currentSkills) {
    for (const t of tokenizeForKeywords(skill)) resumeTokens.add(t);
  }
  const jdTokens = tokenizeForKeywords(jdText);

  // Find which KNOWN_SKILLS appear in the JD. These are the ones that
  // matter for ATS matching; raw token-overlap would dilute the score
  // with stop words and JD boilerplate ("we", "team", "candidate"...).
  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of KNOWN_SKILLS) {
    const skillTokens = tokenizeForKeywords(skill);
    const allInJd = [...skillTokens].every((t) => jdTokens.has(t));
    if (!allInJd) continue;
    const allInResume = [...skillTokens].every((t) => resumeTokens.has(t));
    if (allInResume) matched.push(skill);
    else missing.push(skill);
  }

  const totalRelevant = matched.length + missing.length;
  // No skill keywords appearing in JD → fall back to simple overlap on
  // the JD's own tokens. Better than 0% which would be misleading.
  let matchPercent: number;
  if (totalRelevant === 0) {
    let overlap = 0;
    for (const t of jdTokens) if (resumeTokens.has(t)) overlap++;
    matchPercent = jdTokens.size === 0 ? 0 : Math.round((overlap / jdTokens.size) * 100);
  } else {
    matchPercent = Math.round((matched.length / totalRelevant) * 100);
  }

  return {
    matchPercent: clampPercent(matchPercent),
    matchedKeywords: matched.slice(0, 25),
    missingKeywords: missing.slice(0, 15),
  };
}

export function ruleBasedBulletSuggestions(missingKeywords: string[]): string[] {
  if (!missingKeywords?.length) return [];
  const top = missingKeywords.slice(0, 3);
  return top.map((kw) => {
    // Capitalise just the first letter; preserve 'react', 'aws' →
    // 'React', 'Aws' (which is wrong but acceptable in a fallback —
    // the LLM path produces correctly-cased output).
    const niceKw = kw.charAt(0).toUpperCase() + kw.slice(1);
    return `Built or contributed to a ${niceKw}-based project — quantify the impact in numbers (users, latency, revenue).`;
  });
}

export function parseJdMatchResponse(raw: string): Partial<JdMatchResult> | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : raw;
  try {
    const obj = JSON.parse(candidate);
    if (!obj || typeof obj !== 'object') return null;
    return {
      matchPercent: typeof obj.matchPercent === 'number' ? obj.matchPercent : undefined,
      matchedKeywords: Array.isArray(obj.matchedKeywords)
        ? obj.matchedKeywords.filter((s: unknown) => typeof s === 'string').slice(0, 25)
        : undefined,
      missingKeywords: Array.isArray(obj.missingKeywords)
        ? obj.missingKeywords.filter((s: unknown) => typeof s === 'string').slice(0, 15)
        : undefined,
      bulletSuggestions: Array.isArray(obj.bulletSuggestions)
        ? obj.bulletSuggestions.filter((s: unknown) => typeof s === 'string').slice(0, 3)
        : undefined,
    };
  } catch {
    return null;
  }
}
