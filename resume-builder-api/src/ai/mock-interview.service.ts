import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { rateLimitOrThrow } from '../limits/rate-limit';
import type { AiProvider } from './providers/ai-provider.interface';
import { buildByokProvider } from './providers/byok-factory';
import { serverGroqProvider, isPlanActive, NON_RESUME_AI_UPSELL } from './server-provider';

/**
 * Mock Interview — a chat where the AI plays the INTERVIEWER for a target
 * role, asking questions grounded in the candidate's actual resume (and JD
 * when provided), then critiquing each answer and offering a stronger
 * model answer drawn only from the resume's real content.
 *
 * Complements Interview Prep Cards (static 8 questions) with a live
 * back-and-forth. Stateless server: the client sends the full history each
 * turn, like MentorChatService.
 *
 * Access model (non-resume AI): BYOK → free; ₹499 plan → OUR AI;
 * otherwise a clear upsell message — our app key is never spent for a
 * free, key-less, plan-less user. No rule-based fallback: a scripted
 * interviewer is worse than none.
 */

export type MockInterviewMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type MockInterviewInput = {
  messages: MockInterviewMessage[];
  resumeText?: string;
  targetRole?: string;
  jdText?: string;
};

export type MockInterviewResult = {
  reply: string;
  provider: 'groq' | 'unavailable';
};

const MAX_HISTORY = 24;
const MAX_RESUME_CHARS = 5000;
const MAX_JD_CHARS = 3000;

@Injectable()
export class MockInterviewService {
  private readonly logger = new Logger(MockInterviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async chat(
    userId: string,
    input: MockInterviewInput,
    byok?: { provider?: string | null; key?: string | null },
  ): Promise<MockInterviewResult> {
    const messages = sanitizeInterviewHistory(input?.messages ?? []);

    rateLimitOrThrow({
      key: `ai:mock-interview:${userId}`,
      limit: 8,
      windowMs: 60_000,
      message: 'Slow down — Mock Interview is rate-limited to 8 turns per minute.',
    });

    const byokProvider = buildByokProvider(byok?.provider, byok?.key);
    let provider: AiProvider | null = byokProvider;
    if (!provider) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (!user) throw new ForbiddenException('User not found');
      if (isPlanActive(user.plan)) provider = serverGroqProvider(this.config);
    }
    if (!provider) {
      return {
        reply: `Mock Interview runs on AI. ${NON_RESUME_AI_UPSELL}`,
        provider: 'unavailable',
      };
    }

    const system = buildInterviewerPrompt(
      String(input.resumeText || '').slice(0, MAX_RESUME_CHARS),
      String(input.targetRole || '').trim().slice(0, 100),
      String(input.jdText || '').slice(0, MAX_JD_CHARS),
    );
    const user = serializeInterview(messages);

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '30000'), 10);
      const raw = await provider.complete(system, user, {
        maxTokens: 700,
        temperature: 0.6,
        timeoutMs,
      });
      const reply = String(raw || '').trim();
      if (!reply) {
        return { reply: 'Let me rephrase — could you walk me through that again?', provider: 'groq' };
      }
      return { reply, provider: 'groq' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Mock interview failed (provider=${provider.name}): ${msg}`);
      return {
        reply: 'The interview room glitched — ask me to repeat the question in a few seconds.',
        provider: 'groq',
      };
    }
  }
}

// ── Helpers (exported for tests) ────────────────────────────────────────

export function sanitizeInterviewHistory(messages: unknown[]): MockInterviewMessage[] {
  const out: MockInterviewMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const obj = m as { role?: unknown; content?: unknown };
    const role = obj.role === 'user' || obj.role === 'assistant' ? obj.role : null;
    const content = typeof obj.content === 'string' ? obj.content.trim().slice(0, 2000) : '';
    if (!role || !content) continue;
    out.push({ role, content });
  }
  return out.slice(-MAX_HISTORY);
}

export function buildInterviewerPrompt(resumeText: string, targetRole: string, jdText: string): string {
  const parts = [
    'You are a rigorous but supportive interviewer running a MOCK INTERVIEW.',
    `You are hiring for the role: ${targetRole || 'the role on the candidate\'s resume'}.`,
    'Protocol for every turn:',
    '  1. If the candidate has not answered a question yet, ask ONE interview question grounded in their actual resume (or the JD when provided).',
    '  2. When the candidate answers: give SHORT feedback (2-3 sentences — one strength, one concrete improvement), then a MODEL ANSWER (3-5 sentences) built ONLY from real content in their resume — never invent employers, numbers, or achievements.',
    '  3. Then ask the NEXT question. Vary between behavioral, technical, and role-specific.',
    '  4. Keep the whole reply under 220 words. Plain ASCII; no markdown headings, no emoji.',
    '  5. If the candidate asks to stop or for a summary, give an honest readiness assessment with the top 2 things to practice.',
  ];
  if (resumeText.trim()) parts.push('\nCANDIDATE RESUME:\n' + resumeText.trim());
  else parts.push('\n(No resume provided — ask the candidate to describe their background first.)');
  if (jdText.trim()) parts.push('\nTARGET JOB DESCRIPTION:\n' + jdText.trim());
  return parts.join('\n');
}

export function serializeInterview(messages: MockInterviewMessage[]): string {
  if (!messages.length) return 'Candidate: (The candidate just sat down. Greet them in one sentence and ask your first question.)\n\nInterviewer:';
  const lines = messages.map((m) => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`);
  lines.push('Interviewer:');
  return lines.join('\n\n');
}
