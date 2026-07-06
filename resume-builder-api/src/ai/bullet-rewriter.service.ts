import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { buildByokProvider } from './providers/byok-factory';
import { isPlanActive } from './server-provider';

/**
 * AI Bullet Rewriter — Student/Pro feature.
 *
 * Job-to-be-done: a user editing one resume bullet wants 2–3 alternative
 * phrasings without leaving their seat. The earlier "Apply All Free
 * Suggestions" flow rewrites the whole resume in one shot, which feels
 * heavyweight; per-bullet rewrites are the natural unit of editing.
 *
 * Design choices:
 *   • LLM-driven when GROQ is configured, with a small system prompt
 *     that pins the output to a JSON array of 3 strings. Keeps
 *     downstream parsing trivial (try/catch around JSON.parse).
 *   • Rule-based fallback when no provider is configured OR the call
 *     fails: produce 3 mechanical variants by swapping the leading
 *     verb. Always returns *something* useful so the UI never shows
 *     "feature broken."
 *   • Plan-gated like aiCritique: paymentFeatureEnabled + plan check.
 *   • Cheap on tokens (~400 in/out per call) so the monthly quota
 *     supports tens of clicks per session.
 */

export type RewriteBulletInput = {
  currentBullet: string;
  role?: string;
  company?: string;
  jdText?: string;
  /** Resume being edited — flags our-AI assist for the per-download fee. */
  resumeId?: string;
};

export type RewriteBulletOutput = {
  alternatives: string[];
  provider: 'groq' | 'rule-based';
  /** Token cost we charged the user, for audit / observability. */
  tokensUsed: number;
};

const APPROX_TOKENS = 400;
const MAX_INPUT_CHARS = 600;

@Injectable()
export class BulletRewriterService {
  private readonly logger = new Logger(BulletRewriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async rewrite(userId: string, input: RewriteBulletInput, byok?: { provider?: string | null; key?: string | null }): Promise<RewriteBulletOutput> {
    const bullet = String(input?.currentBullet || '').trim().slice(0, MAX_INPUT_CHARS);
    if (!bullet) {
      throw new ForbiddenException('No bullet text provided.');
    }

    rateLimitOrThrow({
      key: `ai:rewrite-bullet:${userId}`,
      limit: 30,
      windowMs: 60_000,
      message: 'Rate limit exceeded for bullet rewriter. Try again shortly.',
    });

    // Bullet rewrite is NOT one of the two free-user AI features (only AI
    // Critique + Tech Gap are). OUR AI runs only with the user's own key
    // (BYOK) or the ₹499 plan; everyone else gets rule-based variants.
    const byokProvider = buildByokProvider(byok?.provider, byok?.key);
    let provider = byokProvider;
    if (!provider) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (isPlanActive(user?.plan)) provider = this.resolveProvider();
    }
    if (!provider) {
      this.logger.warn('No eligible AI provider — returning rule-based bullet rewrites');
      return {
        alternatives: ruleBasedRewrites(bullet),
        provider: 'rule-based',
        tokensUsed: APPROX_TOKENS,
      };
    }

    const role = String(input.role || '').trim().slice(0, 80);
    const company = String(input.company || '').trim().slice(0, 80);
    const jdSnippet = String(input.jdText || '').trim().slice(0, 800);

    const system = [
      'You are an ATS resume editor.',
      'Given one resume bullet, return THREE rewritten alternatives that:',
      '  1. Start with a strong action verb (Led, Built, Designed, Drove, Reduced, Improved, etc.)',
      '  2. Quantify impact when the original implies it (preserve numbers; do not invent).',
      '  3. Stay under 28 words each.',
      '  4. Use plain ASCII; no em dashes, no emoji, no markdown.',
      '  5. Are factually consistent with the input — do not add achievements.',
      'Respond ONLY with a JSON array of three strings, e.g. ["…", "…", "…"]. No commentary.',
    ].join('\n');

    const userPrompt = [
      `Original bullet: "${bullet}"`,
      role ? `Role context: ${role}` : '',
      company ? `Company: ${company}` : '',
      jdSnippet ? `Target JD snippet: """${jdSnippet}"""` : '',
    ].filter(Boolean).join('\n');

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '20000'), 10);
      const raw = await provider.complete(system, userPrompt, {
        maxTokens: 350,
        temperature: 0.4,
        timeoutMs,
      });
      const parsed = parseAlternatives(raw);
      if (parsed.length < 1) {
        return {
          alternatives: ruleBasedRewrites(bullet),
          provider: 'rule-based',
          tokensUsed: APPROX_TOKENS,
        };
      }
      return {
        alternatives: parsed.slice(0, 3),
        provider: 'groq',
        tokensUsed: APPROX_TOKENS,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Bullet rewrite failed (provider=${provider.name}): ${msg}`);
      return {
        alternatives: ruleBasedRewrites(bullet),
        provider: 'rule-based',
        tokensUsed: APPROX_TOKENS,
      };
    }
  }

  // ── Plan + quota gating (mirrors AiService.checkAndCharge) ───────
  private async checkAndCharge(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');

    const paymentFeatureEnabled = await this.settingsService.isPaymentFeatureEnabled();
    if (paymentFeatureEnabled && user.plan === 'FREE') {
      throw new ForbiddenException('FREE_PLAN_AI_BLOCKED: AI bullet rewrites require Student or Pro.');
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

/** Strict JSON parse with sensible recovery for messy LLM output. */
export function parseAlternatives(raw: string): string[] {
  if (!raw) return [];
  // Greedy match the first JSON array in the response. Some providers
  // wrap output in markdown fences; this strips them.
  const match = raw.match(/\[[\s\S]*\]/);
  const candidate = match ? match[0] : raw;
  try {
    const arr = JSON.parse(candidate);
    if (Array.isArray(arr)) {
      return arr
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => s.length > 0);
    }
  } catch {
    /* fall through */
  }
  // Last-resort: split on newlines if the LLM ignored the JSON instruction.
  return raw
    .split('\n')
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);
}

/**
 * Rule-based fallback. Produces three variants by swapping the leading
 * verb with strong synonyms. Not as good as an LLM rewrite but better
 * than telling the user the feature is broken — and gives free-tier
 * users (when the gate is off) a baseline experience.
 */
/** ATS single-bullet word ceiling — kept in sync with the web editor. */
export const BULLET_MAX_WORDS = 28;

function wordCount(s: string): number {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

/** Filler phrases a rule-based tightener can safely drop to save words. */
const FILLER_RE = /\b(responsible for|taking responsibility for|in order to|as well as|with a focus on|which included|including but not limited to|that helped to|in an effort to|so as to|with the goal of|for the purpose of|a variety of|a number of|various|successfully|effectively|efficiently)\b/gi;

/** Split one over-long bullet into several concise, single-idea bullets. */
export function splitLongBullet(bullet: string, maxWords = BULLET_MAX_WORDS): string[] {
  const text = String(bullet || '').trim();
  if (!text) return [];
  // First split on real sentence boundaries (". Capital"), keeping the stop.
  let parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((p) => p.trim()).filter(Boolean);
  // Any sentence still over the limit is split again on clause connectors.
  parts = parts.flatMap((p) =>
    wordCount(p) <= maxWords
      ? [p]
      : p.split(/\s*(?:;|,\s+(?:and|while|which|including|and ensuring|and driving|and delivering))\s+/i)
          .map((c) => c.trim())
          .filter(Boolean),
  );
  return parts
    .map((p) => {
      let s = p.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
      s = s.charAt(0).toUpperCase() + s.slice(1);
      if (!/[.!?]$/.test(s)) s += '.';
      return s;
    })
    .filter((s) => wordCount(s) >= 2);
}

/** Tighten one bullet toward the word limit without losing its meaning. */
export function shortenBullet(bullet: string, maxWords = BULLET_MAX_WORDS): string {
  const text = String(bullet || '').trim();
  if (!text) return '';
  if (wordCount(text) <= maxWords) return text;
  // Prefer the first complete sentence if it fits.
  const firstSentence = text.split(/(?<=[.!?])\s+(?=[A-Z])/)[0].trim();
  let candidate = wordCount(firstSentence) <= maxWords ? firstSentence : text;
  // Drop filler phrases.
  candidate = candidate.replace(FILLER_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  if (wordCount(candidate) > maxWords) {
    // Truncate at the last word boundary within the limit, on a clause end.
    const words = candidate.replace(/[.!?]+$/, '').split(/\s+/).slice(0, maxWords);
    candidate = words.join(' ');
  }
  candidate = candidate.replace(/[,;\s]+$/, '');
  candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  if (!/[.!?]$/.test(candidate)) candidate += '.';
  return candidate;
}

/**
 * Rule-based fallback. LENGTH-AWARE:
 *   • Over-length bullets → genuinely shorter variants (first sentence,
 *     tightened, first clause) so accepting one actually clears the
 *     "too long" warning — the old verb-swap left it just as long.
 *   • In-range bullets → three verb-swapped phrasings as before.
 */
export function ruleBasedRewrites(bullet: string, maxWords = BULLET_MAX_WORDS): string[] {
  const trimmed = String(bullet || '').trim();
  if (!trimmed) return [];

  if (wordCount(trimmed) > maxWords) {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (s: string) => {
      const clean = String(s || '').trim();
      const key = clean.toLowerCase();
      if (clean && wordCount(clean) <= maxWords && wordCount(clean) >= 3 && !seen.has(key)) {
        seen.add(key);
        out.push(clean);
      }
    };
    // 1. Tightened whole bullet.
    push(shortenBullet(trimmed, maxWords));
    // 2. Each concise piece from a split (the strongest first).
    for (const piece of splitLongBullet(trimmed, maxWords)) push(piece);
    // 3. Guarantee at least one option: a hard-truncated version.
    if (!out.length) {
      const words = trimmed.replace(/[.!?]+$/, '').split(/\s+/).slice(0, maxWords).join(' ');
      push(words.endsWith('.') ? words : `${words}.`);
    }
    return out.slice(0, 3);
  }

  const swaps = ['Led', 'Drove', 'Built'];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const verb of swaps) {
    const variant = swapLeadingVerb(trimmed, verb);
    const key = variant.toLowerCase();
    if (variant && !seen.has(key)) {
      seen.add(key);
      out.push(variant);
    }
  }
  while (out.length < 3) {
    out.push(`Delivered ${trimmed.replace(/^[A-Z][a-z]+\s+/, '').replace(/\.$/, '')}.`);
    if (out.length === 3) break;
    if (out.length > 6) break; // safety
  }
  return out.slice(0, 3);
}

function swapLeadingVerb(bullet: string, newVerb: string): string {
  const cleaned = bullet.replace(/^\s*(?:[•◦▪●*+-]+|\d{1,3}[.)]|[a-z][.)])\s*/i, '');
  const m = cleaned.match(/^([A-Za-z]+)\s+(.+)$/);
  if (!m) return `${newVerb} ${cleaned}`;
  return `${newVerb} ${m[2]}`;
}
