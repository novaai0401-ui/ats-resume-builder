import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GroqProvider } from '../ai/providers/groq.provider';
import { XaiProvider } from '../ai/providers/xai.provider';
import type { AiProvider } from '../ai/providers/ai-provider.interface';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { detectCrisis, type CrisisDetection } from './crisis-detector';
import { summarizeEvents } from './memory-summarizer';
import { buildSahaayakSystemPrompt, type SahaayakMode } from './sahaayak.prompt';
import { companionReply } from './companion-fallback';

const RECENT_MESSAGE_TURNS = 12;
const RECENT_EVENT_LIMIT = 30;
const MAX_MESSAGE_CHARS = 4000;
const VALID_MODES: SahaayakMode[] = ['witness', 'coach', 'karmayoga'];
const VALID_EVENT_KINDS = new Set([
  'rejection', 'interview', 'offer', 'layoff', 'win', 'mood', 'reflection',
]);

export interface ChatResult {
  reply: string;
  crisis: CrisisDetection;
  messageId: string;
}

@Injectable()
export class SahaayakService {
  private readonly logger = new Logger(SahaayakService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getProfile(userId: string) {
    const existing = await this.prisma.sahaayakProfile.findUnique({ where: { userId } });
    return existing ?? null;
  }

  async optIn(userId: string, mode: SahaayakMode = 'witness', guardrails?: string) {
    if (!VALID_MODES.includes(mode)) throw new BadRequestException('invalid mode');
    return this.prisma.sahaayakProfile.upsert({
      where: { userId },
      update: { optedIn: true, mode, guardrails: guardrails ?? null },
      create: { userId, optedIn: true, mode, guardrails: guardrails ?? null },
    });
  }

  async optOut(userId: string) {
    await this.prisma.sahaayakProfile.update({
      where: { userId },
      data: { optedIn: false },
    }).catch(() => undefined);
    return { ok: true };
  }

  /** Hard delete — user's right to be forgotten. */
  async forget(userId: string) {
    await this.prisma.$transaction([
      this.prisma.sahaayakMessage.deleteMany({ where: { userId } }),
      this.prisma.sahaayakEvent.deleteMany({ where: { userId } }),
      this.prisma.sahaayakProfile.deleteMany({ where: { userId } }),
    ]);
    return { ok: true };
  }

  async recordEvent(userId: string, kind: string, payload: unknown, opts?: { note?: string; moodRating?: number; occurredAt?: Date }) {
    await this.assertOptedIn(userId);
    if (!VALID_EVENT_KINDS.has(kind)) {
      throw new BadRequestException(`unknown kind. allowed: ${[...VALID_EVENT_KINDS].join(', ')}`);
    }
    const mood = typeof opts?.moodRating === 'number' ? Math.max(1, Math.min(5, Math.floor(opts.moodRating))) : null;
    return this.prisma.sahaayakEvent.create({
      data: {
        userId,
        kind,
        payload: (payload as object) ?? {},
        note: opts?.note?.slice(0, 1000) ?? null,
        moodRating: mood,
        occurredAt: opts?.occurredAt ?? new Date(),
      },
    });
  }

  async listEvents(userId: string, limit = 50) {
    await this.assertOptedIn(userId);
    return this.prisma.sahaayakEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async chat(userId: string, userMessage: string, opts?: { region?: string }): Promise<ChatResult> {
    rateLimitOrThrow({
      key: `sahaayak:chat:${userId}`,
      limit: 30,
      windowMs: 60_000,
      message: 'Please slow down — Sahaayak is listening, no rush.',
    });
    const profile = await this.assertOptedIn(userId);
    const text = String(userMessage || '').trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text) throw new BadRequestException('message is empty');

    // Crisis detection runs ALWAYS, regardless of model availability.
    const crisis = detectCrisis(text, opts?.region || 'IN');

    // Persist the user turn first so it isn't lost if the LLM call fails.
    await this.prisma.sahaayakMessage.create({
      data: { userId, role: 'user', content: text, crisisFlag: crisis.flag, tokens: estimateTokens(text) },
    });

    const [recentMessages, recentEvents] = await Promise.all([
      this.prisma.sahaayakMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_MESSAGE_TURNS,
      }),
      this.prisma.sahaayakEvent.findMany({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
        take: RECENT_EVENT_LIMIT,
      }),
    ]);

    const summary = summarizeEvents(recentEvents);
    const systemPrompt = buildSahaayakSystemPrompt({
      mode: (profile.mode as SahaayakMode) || 'witness',
      memorySummary: [profile.summary || '', ...summary.patterns].filter(Boolean).join('\n'),
      recentEvents: summary.bullets.join('\n'),
      guardrails: profile.guardrails || '',
      lastSeenAt: profile.lastInteractionAt?.toISOString(),
    });

    const provider = this.resolveProvider();
    let reply: string;
    // Seed rotates the offline companion's wording so it never repeats
    // the same sentence twice in a row. Message count is monotonic per
    // user, so consecutive turns get different replies.
    const turnSeed = recentMessages.length;
    const mode = (profile.mode as SahaayakMode) || 'witness';
    if (!provider) {
      reply = companionReply({ userText: text, mode, seed: turnSeed, crisis: crisis.flag });
    } else {
      try {
        const conversation = recentMessages
          .slice()
          .reverse()
          .map((m) => `${m.role === 'user' ? 'User' : 'Sahaayak'}: ${m.content}`)
          .join('\n');
        reply = await provider.complete(
          systemPrompt,
          `Conversation so far:\n${conversation}\n\nRespond as Sahaayak, in 2-4 sentences.`,
          { maxTokens: 400, temperature: 0.7, timeoutMs: 25_000 },
        );
        reply = stripJsonFraming(reply);
      } catch (error) {
        this.logger.warn(`chat LLM failed: ${error instanceof Error ? error.message : String(error)}`);
        reply = companionReply({ userText: text, mode, seed: turnSeed, crisis: crisis.flag });
      }
    }

    if (crisis.flag) {
      reply = appendCrisisFooter(reply, crisis);
    }

    const saved = await this.prisma.sahaayakMessage.create({
      data: { userId, role: 'assistant', content: reply, tokens: estimateTokens(reply) },
    });
    await this.prisma.sahaayakProfile.update({
      where: { userId },
      data: { lastInteractionAt: new Date() },
    });

    return { reply, crisis, messageId: saved.id };
  }

  async listMessages(userId: string, limit = 30) {
    await this.assertOptedIn(userId);
    const rows = await this.prisma.sahaayakMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.reverse();
  }

  async checkInPrompt(userId: string) {
    const profile = await this.assertOptedIn(userId);
    const recentEvents = await this.prisma.sahaayakEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });
    const summary = summarizeEvents(recentEvents);
    // Deterministic check-in — no LLM call needed for the daily ping.
    if (summary.patterns.length > 0) {
      return { prompt: `Something I've been noticing: ${summary.patterns[0]} How are you sitting with that today?` };
    }
    if (profile.lastInteractionAt) {
      return { prompt: 'How are you holding up since we last spoke?' };
    }
    return { prompt: 'I am here. How is today landing for you?' };
  }

  private async assertOptedIn(userId: string) {
    const p = await this.prisma.sahaayakProfile.findUnique({ where: { userId } });
    if (!p || !p.optedIn) {
      throw new ForbiddenException('Sahaayak requires explicit opt-in. POST /sahaayak/opt-in first.');
    }
    return p;
  }

  private resolveProvider(): AiProvider | null {
    const groqKey = this.config.get<string>('GROQ_API_KEY');
    if (groqKey) return new GroqProvider(groqKey);
    const xaiKey = this.config.get<string>('XAI_API_KEY');
    if (xaiKey) return new XaiProvider(xaiKey);
    return null;
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(String(text || '').length / 4);
}

function stripJsonFraming(raw: string): string {
  // Groq is initialized with response_format=json_object in some providers,
  // but for chat we want plain text. If the model returned a JSON envelope
  // unexpectedly, extract a reasonable text field.
  const trimmed = String(raw || '').trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const obj = JSON.parse(trimmed);
    return String(obj.reply || obj.text || obj.message || trimmed);
  } catch {
    return trimmed;
  }
}

function appendCrisisFooter(reply: string, crisis: CrisisDetection): string {
  const lines = crisis.resources.slice(0, 3).map((r) => {
    const phone = r.phone ? ` — ${r.phone}` : '';
    return `• ${r.name}${phone} (${r.hours})`;
  });
  const footer = `\n\n— You are not alone. If it would help, these people are available right now:\n${lines.join('\n')}`;
  return reply + footer;
}
