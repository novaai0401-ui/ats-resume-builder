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
import {
  enforceResumeAiFreeDaily,
  enforceResumeBuildAssistDaily,
  recordResumeAiFreeUsage,
  recordResumeBuildAssistUsage,
  resolveResumeAiProvider,
} from './resume-ai-access';

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

    // Resume-page AI access (R-086/R-103): OUR Groq key powers Rewrite for
    // every user — BYOK (own key) / ₹499 plan (uncapped) / FREE (our key).
    // Rewrite is BUILD ASSIST, not a sampled feature: it does NOT consume the
    // R-098 one-free-run-per-feature trial, because a user must be able to
    // write a whole resume. Only a generous daily ceiling applies.
    const { provider, source } = await resolveResumeAiProvider(
      this.prisma, userId, byok, () => this.resolveProvider(),
    );
    const freeDaily = source === 'free';
    if (!provider) {
      this.logger.warn('No eligible AI provider — returning rule-based bullet rewrites');
      return {
        alternatives: ruleBasedRewrites(bullet),
        provider: 'rule-based',
        tokensUsed: APPROX_TOKENS,
      };
    }
    // R-103 — a saved resume binds this rewrite to the user's one free-AI
    // resume: unlimited there, plan required on any other. An unsaved draft
    // has no id to bind to yet, so it runs on the build-assist ceiling alone
    // (the user is mid-build; refusing here would strand them).
    const boundResumeId = String(input.resumeId || '').trim();
    if (freeDaily) {
      if (boundResumeId) {
        await enforceResumeAiFreeDaily(this.prisma, this.config, userId, 'bullet-rewrite', boundResumeId);
      } else {
        await enforceResumeBuildAssistDaily(this.prisma, this.config, userId);
      }
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
      if (freeDaily) {
        if (boundResumeId) {
          await recordResumeAiFreeUsage(this.prisma, userId, 'bullet-rewrite', boundResumeId);
        } else {
          await recordResumeBuildAssistUsage(this.prisma, userId);
        }
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

/**
 * Filler phrases a rule-based tightener can safely drop to save words
 * WITHOUT changing meaning — padding verbs/adverbs and throat-clearing.
 */
const FILLER_RE = /\b(responsible for|taking responsibility for|in order to|as well as|with a focus on|which included|including but not limited to|that helped to|in an effort to|so as to|with the goal of|for the purpose of|a variety of|a number of|various|successfully|effectively|efficiently|actively|closely|proactively|as needed|on a regular basis|from time to time|end to end|end-to-end)\b/gi;

/** Strong resume action verbs — for ranking and role-leak detection. */
const ACTION_VERBS = new Set(
  (
    'led managed built designed drove developed delivered launched created improved ' +
    'reduced increased grew owned architected implemented migrated optimized automated ' +
    'mentored coordinated established streamlined engineered spearheaded oversaw directed ' +
    'scaled shipped introduced integrated deployed refactored analyzed championed cut ' +
    'boosted accelerated enabled ensured maintained supported defined'
  ).split(' '),
);

/** Seniority/title tokens that mark a clause as a leaked role fragment. */
const TITLE_TOKENS = /\b(vice president|president|director|manager|engineer|analyst|architect|officer|consultant|specialist|associate|intern|head|lead|principal|founder|owner|coordinator|administrator)\b/i;

/** Words a clause must NOT end on — a truncated/dangling fragment. */
const DANGLING_END = /\b(by|with|for|to|of|and|or|in|on|at|from|the|a|an|as|via|into|through|that|which|while)$/i;

/** Strip any leading list marker / numbering the editor may have kept. */
function stripMarker(s: string): string {
  return String(s || '').replace(/^\s*(?:[•◦▪●*+\-]+|\d{1,3}[.)]|[a-z][.)])\s*/i, '').trim();
}

/**
 * A leaked role/title clause such as "Led an Assistant Vice President" —
 * a verb followed only by a job title. Extraction artifact, not an
 * achievement, so we drop it.
 */
function isRoleLeakClause(clause: string): boolean {
  const m = clause
    .trim()
    .match(/^(led|managed|was|served|worked|acted|promoted|reporting|reported|joined|hired)\s+(as\s+|to\s+)?(an?\s+|the\s+)?(.+)$/i);
  if (!m) return false;
  const rest = m[4].trim();
  return TITLE_TOKENS.test(rest) && wordCount(rest) <= 5;
}

/**
 * A dangling/truncated fragment we should not surface as a rewrite:
 * ends on a preposition/article ("…recognized by", "…as part of the"),
 * or is a stub with no real content.
 */
function isDanglingFragment(clause: string): boolean {
  const w = clause.trim().replace(/[.,;:]+$/, '');
  if (wordCount(w) < 2) return true;
  return DANGLING_END.test(w);
}

/**
 * Whether a bullet contains content a tightener would drop even if it is
 * within the word limit: a leaked job title, a dangling truncated
 * fragment ("…recognized by"), or filler. Used to decide whether an
 * in-range bullet still deserves a clean rewrite vs. a plain verb-swap.
 */
function hasDroppableJunk(bullet: string, maxWords = BULLET_MAX_WORDS): boolean {
  const text = stripMarker(bullet);
  if (!text) return false;
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  for (const sent of sentences) {
    for (const c of splitClauses(sent)) {
      if (isRoleLeakClause(c) || isDanglingFragment(c)) return true;
    }
  }
  FILLER_RE.lastIndex = 0;
  const hasFiller = FILLER_RE.test(text);
  FILLER_RE.lastIndex = 0;
  // Only treat filler as "junk worth rewriting" when dropping it would
  // matter — i.e. the bullet is already near the limit.
  return hasFiller && wordCount(text) > maxWords - 6;
}

/**
 * Break a sentence into clauses. We split on commas/semicolons AND on
 * subordinate/participial connectors ("while", "which", "including",
 * "resulting in", …) so a long SINGLE-sentence bullet still yields
 * tightenable pieces rather than staying one un-shortenable blob.
 */
function splitClauses(sentence: string): string[] {
  const SENTINEL = '|||CLAUSE_BREAK|||';
  return sentence
    .replace(
      /\s+(while|whereby|thereby|which|including|so that|in order to|resulting in|leading to|such that)\s+/gi,
      `${SENTINEL}$1 `,
    )
    .replace(/\s*[;,]\s*/g, SENTINEL)
    .split(SENTINEL)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Drop filler phrases and a dangling leading connector; squeeze spaces. */
function dropFiller(s: string): string {
  return s
    .replace(FILLER_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*(?:and|while|which|that|including|also|then|plus|so that|in order to)\s+/i, '')
    .replace(/\s+,/g, ',')
    .trim();
}

/** Trim edge punctuation, capitalize the first letter, terminate cleanly. */
function tidy(s: string): string {
  let t = s.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function hasMetric(s: string): boolean {
  return /(\d|%|₹|\$)/.test(s);
}

function startsWithActionVerb(s: string): boolean {
  const w = s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  return ACTION_VERBS.has(w);
}

/** Rank: impact-first — verb-led and metric-bearing clauses win. */
function candidateScore(s: string): number {
  let n = 0;
  if (startsWithActionVerb(s)) n += 2;
  if (hasMetric(s)) n += 3;
  if (wordCount(s) >= 6) n += 1;
  return n;
}

/**
 * Core clause engine shared by shorten/split/rewrite. Breaks the bullet
 * into sentences → clauses, discards leaked-title, dangling, and
 * filler-only clauses, then greedily packs surviving clauses into tidy
 * single-idea bullets each within `maxWords`. `rank` sorts impact-first
 * (for suggestions); leave it off to preserve document order (splitting).
 */
function buildBulletCandidates(bullet: string, maxWords: number, rank: boolean): string[] {
  const text = stripMarker(bullet);
  if (!text) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const sent of sentences) {
    const clauses = splitClauses(sent)
      .filter((c) => !isRoleLeakClause(c))
      .filter((c) => !isDanglingFragment(c))
      .map(dropFiller)
      .filter((c) => wordCount(c) >= 1);
    if (!clauses.length) continue;

    let group: string[] = [];
    let count = 0;
    const flush = () => {
      if (group.length) {
        candidates.push(tidy(group.join(', ')));
        group = [];
        count = 0;
      }
    };
    for (const c of clauses) {
      const wc = wordCount(c);
      if (wc > maxWords) {
        flush();
        candidates.push(tidy(c.split(/\s+/).slice(0, maxWords).join(' ')));
        continue;
      }
      if (count + wc > maxWords) flush();
      group.push(c);
      count += wc;
    }
    flush();
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (wordCount(c) >= 2 && wordCount(c) <= maxWords && !seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  if (rank) out.sort((a, b) => candidateScore(b) - candidateScore(a));
  return out;
}

/**
 * Split one over-long bullet into several concise, single-idea bullets,
 * in document order. Returns the original (tidied) as a single element
 * when nothing meaningfully splits.
 */
export function splitLongBullet(bullet: string, maxWords = BULLET_MAX_WORDS): string[] {
  const out = buildBulletCandidates(bullet, maxWords, false);
  return out.length ? out : [tidy(stripMarker(bullet))].filter(Boolean);
}

/** Tighten one bullet to a single clean ≤maxWords bullet (impact-first). */
export function shortenBullet(bullet: string, maxWords = BULLET_MAX_WORDS): string {
  const text = stripMarker(bullet);
  if (!text) return '';
  if (wordCount(text) <= maxWords) return text;
  const ranked = buildBulletCandidates(text, maxWords, true);
  if (ranked.length) return ranked[0];
  return tidy(text.replace(/[.!?]+$/, '').split(/\s+/).slice(0, maxWords).join(' '));
}

/**
 * Rule-based fallback. LENGTH-AWARE and content-aware:
 *   • Over-length bullets → clean, impact-first ≤maxWords rewrites built
 *     from the strongest surviving clauses (leaked job titles, dangling
 *     fragments, and filler dropped; no mid-word truncation) so accepting
 *     one actually clears the "too long" warning AND reads well. When the
 *     bullet is a single idea that only yields one clean rewrite, we pad
 *     with verb-swapped variants of it so the user still gets choices.
 *   • In-range bullets → three verb-swapped phrasings as before.
 */
export function ruleBasedRewrites(bullet: string, maxWords = BULLET_MAX_WORDS): string[] {
  const trimmed = stripMarker(bullet);
  if (!trimmed) return [];

  // Tighten whenever the bullet is over the limit OR carries droppable
  // junk (a leaked job title, a dangling truncated fragment, or filler) —
  // an in-range bullet ending "…the solution was recognized by" must
  // still be cleaned, not just verb-swapped.
  if (wordCount(trimmed) > maxWords || hasDroppableJunk(trimmed)) {
    const ranked = buildBulletCandidates(trimmed, maxWords, true);
    const seen = new Set(ranked.map((r) => r.toLowerCase()));
    const out = [...ranked];
    // Give the user 2–3 choices even for a single-idea bullet: offer
    // verb-swapped variants of the strongest rewrite.
    if (out.length && out.length < 3) {
      for (const verb of ['Led', 'Drove', 'Delivered', 'Built']) {
        const variant = swapLeadingVerb(out[0], verb);
        const key = variant.toLowerCase();
        if (variant && wordCount(variant) <= maxWords && !seen.has(key)) {
          seen.add(key);
          out.push(variant);
        }
        if (out.length >= 3) break;
      }
    }
    if (out.length) return out.slice(0, 3);
    // Guarantee at least one option: a hard-truncated version.
    return [tidy(trimmed.replace(/[.!?]+$/, '').split(/\s+/).slice(0, maxWords).join(' '))];
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
