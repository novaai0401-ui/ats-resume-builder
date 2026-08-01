import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { enforceFreeAiResume, enforceFreeTrialOrThrow, recordFreeTrialUse, type AiFeatureKey } from './free-trial';
import { buildByokProvider } from './providers/byok-factory';
import { serverGroqProvider, isPlanActive } from './server-provider';
import { XaiProvider } from './providers/xai.provider';
import {
  buildCoverLetterPrompt,
  buildFallbackCoverLetter,
  countWords,
  type CoverLetterPromptInput,
  type CoverLetterTone,
} from './prompts/cover-letter.prompt';

const TONES: CoverLetterTone[] = ['professional', 'enthusiastic', 'concise', 'formal'];

export interface GenerateCoverLetterInput {
  resumeId?: string;
  company: string;
  role: string;
  tone?: CoverLetterTone;
  jdText?: string;
  /** Override resume-derived facts (useful when user hasn't saved a resume yet). */
  candidate?: {
    fullName?: string;
    summary?: string;
    skills?: string[];
    experience?: CoverLetterPromptInput['experience'];
    education?: CoverLetterPromptInput['education'];
  };
}

export interface GenerateCoverLetterResult {
  id: string;
  body: string;
  wordCount: number;
  provider: string;
  tone: CoverLetterTone;
  company: string;
  role: string;
}

@Injectable()
export class CoverLetterService {
  private readonly logger = new Logger(CoverLetterService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  async generate(userId: string, input: GenerateCoverLetterInput, byok?: { provider?: string | null; key?: string | null }): Promise<GenerateCoverLetterResult> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    const company = (input.company || '').trim();
    const role = (input.role || '').trim();
    if (!company) throw new BadRequestException('company is required');
    if (!role) throw new BadRequestException('role is required');
    if (company.length > 200 || role.length > 200) {
      throw new BadRequestException('company/role must be ≤200 chars');
    }

    const tone: CoverLetterTone = TONES.includes(input.tone as CoverLetterTone)
      ? (input.tone as CoverLetterTone)
      : 'professional';

    rateLimitOrThrow({
      key: `ai:cover-letter:${userId}`,
      limit: 10,
      windowMs: 60_000,
      message: 'Rate limit exceeded for cover letter generation.',
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const promptInput = await this.buildPromptInput(userId, input, user.fullName);

    // Non-resume AI model: BYOK drives the LLM for free; the ₹499/mo plan
    // unlocks OUR AI. With neither, the rule-based letter is the deliverable.
    const byokProvider = buildByokProvider(byok?.provider, byok?.key);
    let provider = byokProvider || (isPlanActive(user.plan) ? serverGroqProvider(this.config) : null);
    // R-098 — a free, key-less, plan-less user gets ONE real AI cover letter
    // on our key. The second attempt throws the structured trial error the
    // client turns into the "used once" popup.
    let trialFeature: AiFeatureKey | null = null;
    if (!provider) {
      const ourProvider = serverGroqProvider(this.config);
      if (ourProvider) {
        // R-103 — a letter written FROM a saved resume binds to that resume:
        // unlimited on the user's one free-AI resume, plan required on any
        // other. A letter with no resumeId (pasted candidate details) keeps
        // the R-098 one-free-run rule.
        if (input.resumeId) {
          await enforceFreeAiResume(this.prisma, userId, input.resumeId);
        } else {
          await enforceFreeTrialOrThrow(this.prisma, userId, 'cover-letter');
          trialFeature = 'cover-letter';
        }
        provider = ourProvider;
      }
    }
    let providerName = 'fallback';
    let body: string;
    let wordCount: number;

    if (provider) {
      try {
        const { system, user: userPrompt } = buildCoverLetterPrompt(promptInput);
        const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '30000'), 10);
        const raw = await provider.complete(system, userPrompt, {
          maxTokens: 1400,
          temperature: 0.5,
          timeoutMs,
        });
        const parsed = parseCoverLetterJson(raw);
        body = parsed.body;
        wordCount = parsed.wordCount || countWords(parsed.body);
        providerName = provider.name;
        // Burn the free run only when the AI actually produced a letter.
        if (trialFeature) await recordFreeTrialUse(this.prisma, userId, trialFeature);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Cover letter provider failed (${provider.name}): ${msg}`);
        body = buildFallbackCoverLetter(promptInput);
        wordCount = countWords(body);
        providerName = 'fallback';
      }
    } else {
      body = buildFallbackCoverLetter(promptInput);
      wordCount = countWords(body);
    }

    const saved = await this.prisma.coverLetter.create({
      data: {
        userId,
        resumeId: input.resumeId || null,
        company,
        role,
        jdText: input.jdText ? input.jdText.slice(0, 20000) : null,
        tone,
        body,
        wordCount,
        provider: providerName,
      },
    });

    return {
      id: saved.id,
      body: saved.body,
      wordCount: saved.wordCount,
      provider: providerName,
      tone,
      company,
      role,
    };
  }

  async list(userId: string) {
    return this.prisma.coverLetter.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.coverLetter.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Cover letter not found');
    return row;
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.coverLetter.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Cover letter not found');
    await this.prisma.coverLetter.delete({ where: { id } });
    return { ok: true };
  }

  private async buildPromptInput(
    userId: string,
    input: GenerateCoverLetterInput,
    fullName: string,
  ): Promise<CoverLetterPromptInput> {
    let summary = input.candidate?.summary;
    let skills = input.candidate?.skills;
    let experience = input.candidate?.experience;
    let education = input.candidate?.education;

    if (input.resumeId) {
      const resume = await this.prisma.resume.findFirst({
        where: { id: input.resumeId, userId },
      });
      if (!resume) throw new NotFoundException('Resume not found');
      summary = summary ?? resume.summary ?? '';
      skills = skills ?? resume.skills ?? [];
      experience = experience ?? (resume.experience as CoverLetterPromptInput['experience']) ?? [];
      education = education ?? (resume.education as CoverLetterPromptInput['education']) ?? [];
    }

    return {
      fullName: input.candidate?.fullName || fullName,
      company: input.company,
      role: input.role,
      tone: (input.tone || 'professional') as CoverLetterTone,
      summary: summary || '',
      skills: skills || [],
      experience: experience || [],
      education: education || [],
      jdText: input.jdText,
    };
  }

  private resolveProvider(): AiProvider | null {
    const providerName = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (providerName === 'xai') {
      const key = this.config.get<string>('XAI_API_KEY', '');
      if (!key) return null;
      const model = this.config.get<string>('XAI_MODEL', '');
      return new XaiProvider(key, model || undefined);
    }
    const key = this.config.get<string>('GROQ_API_KEY', '');
    if (!key) return null;
    const model = this.config.get<string>('GROQ_MODEL', '');
    return new GroqProvider(key, model || undefined);
  }

  private async isPaymentFeatureEnabled() {
    if (!this.settingsService) return false;
    return this.settingsService.isPaymentFeatureEnabled();
  }
}

export function parseCoverLetterJson(raw: string): { body: string; wordCount: number } {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
  }

  if (parsed && typeof parsed.body === 'string' && parsed.body.trim().length > 40) {
    const body = parsed.body.trim();
    const wordCount =
      typeof parsed.wordCount === 'number' && parsed.wordCount > 0
        ? Math.floor(parsed.wordCount)
        : countWords(body);
    return { body, wordCount };
  }

  const trimmed = raw.trim();
  if (trimmed.length > 40 && /dear/i.test(trimmed)) {
    return { body: trimmed, wordCount: countWords(trimmed) };
  }

  throw new Error('AI response did not contain a usable cover letter body');
}
