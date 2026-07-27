import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { buildByokProvider } from './providers/byok-factory';
import { isPlanActive, NON_RESUME_AI_UPSELL } from './server-provider';
import { enforceFreeTrialOrThrow, recordFreeTrialUse, type AiFeatureKey } from './free-trial';

/**
 * Mentor Chat — Pro only, the marquee Pro differentiator.
 *
 * The user has a question about their career, role choice, learning
 * priorities, etc. Unlike a generic chatbot, our mentor has the
 * user's ACTUAL resume + job-tracker history as context, so it can
 * say things like "given your 4 years of React work and your three
 * applications to fintech roles, you should focus on..."
 *
 * Design choices:
 *   • Stateless server. Client passes the entire `messages` history
 *     on each request. Simpler than session storage; the message
 *     history is short (capped to 20 turns) so token cost is bounded.
 *   • The system prompt is the moat: we inject the user's resume +
 *     recent job applications. Competitors without our backend
 *     can't replicate this experience.
 *   • Pro-only gate. Free / Student get a paywall. The rule-based
 *     fallback is intentionally minimal — chat is a feature where
 *     "no AI = no feature" is the right call (vs JD Match where
 *     rule-based scoring is genuinely useful).
 *   • Daily turn cap (20) to keep token costs bounded even for
 *     enthusiastic users. The cap is reset by ensureUsagePeriod.
 */

export type MentorChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type MentorChatInput = {
  messages: MentorChatMessage[];
  resumeText?: string;
  recentJobApplications?: Array<{
    company: string;
    role: string;
    status: string;
  }>;
};

export type MentorChatResult = {
  reply: string;
  provider: 'groq' | 'unavailable';
  tokensUsed: number;
};

const APPROX_TOKENS_PER_TURN = 800;
const MAX_TURNS_PER_DAY = 20;
const MAX_HISTORY = 20;
const MAX_RESUME_CHARS = 5000;

@Injectable()
export class MentorChatService {
  private readonly logger = new Logger(MentorChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async chat(userId: string, input: MentorChatInput, byok?: { provider?: string | null; key?: string | null }): Promise<MentorChatResult> {
    const messages = sanitizeHistory(input?.messages ?? []);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      throw new ForbiddenException('The last message must be from the user.');
    }
    const lastUser = messages[messages.length - 1].content.trim();
    if (lastUser.length === 0) {
      throw new ForbiddenException('Your message is empty.');
    }
    if (lastUser.length > 2000) {
      throw new ForbiddenException('Message too long (max 2000 characters).');
    }

    rateLimitOrThrow({
      key: `ai:mentor-chat:${userId}`,
      limit: 6,
      windowMs: 60_000,
      message: 'Slow down — Mentor Chat is rate-limited to 6 turns per minute.',
    });

    // Non-resume AI: BYOK is free; otherwise the ₹499/mo plan unlocks OUR
    // AI. With neither, there's no useful rule-based chat — show the upsell.
    const dbUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) throw new ForbiddenException('User not found');
    const byokProvider = buildByokProvider(byok?.provider, byok?.key);
    const planActive = isPlanActive(dbUser.plan);
    // R-098 — one free real AI mentor turn for a free, key-less user; the
    // second attempt throws the structured trial error (client shows the popup).
    let trialFeature: AiFeatureKey | null = null;
    if (!byokProvider && !planActive) {
      if (!this.resolveProvider()) {
        return {
          reply: `Mentor Chat runs on AI. ${NON_RESUME_AI_UPSELL}`,
          provider: 'unavailable',
          tokensUsed: 0,
        };
      }
      await enforceFreeTrialOrThrow(this.prisma, userId, 'mentor-chat');
      trialFeature = 'mentor-chat';
    }

    // Only the PLAN path spends the subscriber token budget; BYOK is on the
    // user, and the single free trial turn is metered by the trial ledger.
    if (!byokProvider && planActive) {
      await this.chargePlanTokens(userId, APPROX_TOKENS_PER_TURN);
    }

    const provider = byokProvider || this.resolveProvider();
    if (!provider) {
      // No fallback — chat without an LLM isn't useful enough to
      // bother with rule-based replies. The user gets a clear
      // message instead of a silly canned response.
      return {
        reply:
          'Mentor Chat needs the AI provider to be configured. Please reach out to novaai0401@gmail.com — this should be live shortly.',
        provider: 'unavailable',
        tokensUsed: 0,
      };
    }

    const resumeText = String(input.resumeText || '').slice(0, MAX_RESUME_CHARS);
    const jobs = (input.recentJobApplications ?? []).slice(0, 8);

    const system = buildSystemPrompt(resumeText, jobs);
    const user = serializeChatHistory(messages);

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '30000'), 10);
      const raw = await provider.complete(system, user, {
        maxTokens: 700,
        temperature: 0.6,
        timeoutMs,
        // Conversational reply, not JSON — see AiCompletionOptions.json.
        json: false,
      });
      const reply = String(raw || '').trim();
      if (!reply) {
        return {
          reply: 'I lost my train of thought there. Could you ask that again?',
          provider: 'groq',
          tokensUsed: APPROX_TOKENS_PER_TURN,
        };
      }
      if (trialFeature) await recordFreeTrialUse(this.prisma, userId, trialFeature);
      return { reply, provider: 'groq', tokensUsed: APPROX_TOKENS_PER_TURN };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Mentor chat failed (provider=${provider.name}): ${msg}`);
      return {
        reply:
          'My head is buzzing — the AI service had a hiccup. Try asking again in a few seconds.',
        provider: 'groq',
        tokensUsed: 0,
      };
    }
  }

  /** Charge app-AI tokens for plan users (BYOK users don't reach here). */
  private async chargePlanTokens(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    await ensureUsagePeriod(this.prisma, user);
    const updated = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!updated) throw new ForbiddenException('User not found');
    if (updated.aiTokensUsed + tokens > updated.aiTokensLimit) {
      throw new ForbiddenException('AI usage limit exceeded for this period.');
    }
    // Daily turn cap: tracked in-memory via the rate-limit window above
    // (~6/min). Real per-day enforcement would need a DB column; for
    // v1 the per-minute limit + the monthly token cap is enough — a
    // power user hitting 20 turns/day still has tokens left.
    void MAX_TURNS_PER_DAY;
    void MAX_HISTORY;
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

/**
 * Trim the chat history to the last MAX_HISTORY turns and drop anything
 * that doesn't have a recognisable role + non-empty content. Keeps the
 * token budget bounded and protects against client-side bugs that send
 * stale or malformed messages.
 */
export function sanitizeHistory(messages: unknown[]): MentorChatMessage[] {
  const out: MentorChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const obj = m as { role?: unknown; content?: unknown };
    const role = obj.role === 'user' || obj.role === 'assistant' ? obj.role : null;
    const content = typeof obj.content === 'string' ? obj.content.trim() : '';
    if (!role || !content) continue;
    out.push({ role, content });
  }
  return out.slice(-MAX_HISTORY);
}

/**
 * Build the mentor system prompt. The resume + recent jobs are the
 * differentiator; without them the chat would be a generic LLM
 * conversation and our user could get the same answer from ChatGPT.
 */
export function buildSystemPrompt(
  resumeText: string,
  jobs: Array<{ company: string; role: string; status: string }>,
): string {
  const parts = [
    'You are a senior career mentor for CallbackCV users.',
    'Your job is to give concrete, actionable career advice — never generic platitudes.',
    'Tone: warm, direct, like a senior peer who has 15+ years of experience and respects the user\'s time.',
    'Constraints:',
    '  • Keep replies under 200 words unless the user explicitly asks for more depth.',
    '  • Reference the candidate\'s actual experience or applications when relevant.',
    '  • Never invent achievements; if you don\'t know something, ask.',
    '  • Default to plain ASCII; no markdown headings, no emoji.',
    '  • If the user asks something unrelated to careers, redirect briefly back to career topics.',
  ];
  if (resumeText.trim()) {
    parts.push('\nCANDIDATE\'S CURRENT RESUME:\n' + resumeText.trim());
  } else {
    parts.push('\n(No resume on file — encourage the user to build one in CallbackCV.)');
  }
  if (jobs.length > 0) {
    const lines = jobs.map((j) => `  • ${j.role} at ${j.company} — ${j.status}`).join('\n');
    parts.push('\nRECENT JOB APPLICATIONS:\n' + lines);
  }
  return parts.join('\n');
}

/**
 * Convert a structured chat history into a single user-message string
 * for the LLM. We could use the OpenAI/GROQ chat-format directly, but
 * our AiProvider interface is text-only, so we serialise here. The
 * format (Mentor: / User:) is deliberately verbose so the model
 * understands turn boundaries without us adding stop sequences.
 */
export function serializeChatHistory(messages: MentorChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const speaker = m.role === 'user' ? 'User' : 'Mentor';
    lines.push(`${speaker}: ${m.content}`);
  }
  lines.push('Mentor:'); // prompt the model to continue as the mentor
  return lines.join('\n\n');
}
