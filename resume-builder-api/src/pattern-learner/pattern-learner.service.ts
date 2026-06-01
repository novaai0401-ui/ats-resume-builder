import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroqProvider } from '../ai/providers/groq.provider';
import { XaiProvider } from '../ai/providers/xai.provider';
import type { AiProvider } from '../ai/providers/ai-provider.interface';
import { redactPII } from './redact';
import { isPatternKind, PATTERN_KINDS, type PatternKind } from './known-pattern-kinds';
import {
  compilePattern,
  validateProposal,
  type CorpusSample,
  type PatternProposal,
} from './pattern-validator';
import {
  buildProposerUserPrompt,
  PROPOSER_SYSTEM_PROMPT,
} from './pattern-proposer.prompt';

/**
 * Confidence below which a parse is captured for the learner.
 * Tuned conservatively — verifier already flags `shouldReExtract < 0.55`,
 * we collect everything below 0.7 so the corpus has marginal cases too.
 */
const CAPTURE_THRESHOLD = 0.7;
/** Max samples scanned during regression validation. */
const VALIDATION_CORPUS_LIMIT = 200;
/** Hot-cache TTL for promoted patterns served back to the parser. */
const PATTERN_CACHE_TTL_MS = 60_000;

export interface CaptureInput {
  userId?: string;
  fileName?: string;
  rawText: string;
  verification: {
    ok: boolean;
    confidence: number;
    issues: Array<{ kind: string; detail: string }>;
  };
  extractedShape: Record<string, unknown>;
  trigger?: 'low-confidence' | 'user-flagged' | 'missing-section';
}

@Injectable()
export class PatternLearnerService {
  private readonly logger = new Logger(PatternLearnerService.name);
  private patternCache: { at: number; rows: Array<{ kind: string; pattern: string; flags: string }> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fire-and-forget capture from the resume upload pipeline. Never throws —
   * a learner failure must not break user uploads.
   */
  async captureFailure(input: CaptureInput): Promise<void> {
    try {
      const confidence = Number(input.verification?.confidence ?? 1);
      if (Number.isFinite(confidence) && confidence >= CAPTURE_THRESHOLD && input.trigger !== 'user-flagged') {
        return;
      }
      await this.prisma.parseFailureSample.create({
        data: {
          userId: input.userId ?? null,
          fileName: input.fileName ?? null,
          redactedText: redactPII(input.rawText),
          verification: input.verification as object,
          extractedShape: input.extractedShape as object,
          trigger: input.trigger ?? 'low-confidence',
        },
      });
    } catch (error) {
      this.logger.warn(`captureFailure failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listFailures(opts: { status?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    return this.prisma.parseFailureSample.findMany({
      where: opts.status ? { status: opts.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async listPatterns(opts: { status?: string } = {}) {
    return this.prisma.learnedPattern.findMany({
      where: opts.status ? { status: opts.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Ask the LLM to propose a regex for a given failure sample + target kind,
   * validate it against the corpus, and persist it as `proposed`.
   */
  async proposeForSample(sampleId: string, kind: string) {
    if (!isPatternKind(kind)) {
      throw new BadRequestException(`Unknown kind. Allowed: ${PATTERN_KINDS.join(', ')}`);
    }
    const sample = await this.prisma.parseFailureSample.findUnique({ where: { id: sampleId } });
    if (!sample) throw new NotFoundException('Sample not found');

    const provider = this.resolveProvider();
    if (!provider) {
      throw new BadRequestException('No AI provider configured. Set GROQ_API_KEY or XAI_API_KEY.');
    }

    const userPrompt = buildProposerUserPrompt({
      kind,
      redactedText: sample.redactedText,
      verificationIssues: (sample.verification as any)?.issues ?? [],
      extractedShape: sample.extractedShape,
    });

    let raw: string;
    try {
      raw = await provider.complete(PROPOSER_SYSTEM_PROMPT, userPrompt, {
        maxTokens: 600,
        temperature: 0.2,
        timeoutMs: 25_000,
      });
    } catch (error) {
      throw new BadRequestException(`LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const parsed = safeParseJson(raw);
    if (parsed?.abstain) {
      throw new BadRequestException('LLM abstained — no safe pattern available for this sample.');
    }
    const proposal: PatternProposal = {
      kind,
      pattern: String(parsed?.pattern || ''),
      flags: String(parsed?.flags || 'i'),
      patternType: 'regex',
    };
    try {
      compilePattern(proposal);
    } catch (error) {
      throw new BadRequestException(`Invalid proposal: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    const corpus = await this.loadCorpus();
    const target: CorpusSample = {
      id: sample.id,
      redactedText: sample.redactedText,
      confidence: Number((sample.verification as any)?.confidence ?? 0),
    };
    const validation = validateProposal(proposal, target, corpus);

    const pattern = await this.prisma.learnedPattern.create({
      data: {
        kind,
        pattern: proposal.pattern,
        flags: proposal.flags,
        patternType: 'regex',
        rationale: String(parsed?.rationale || '').slice(0, 500),
        examples: Array.isArray(parsed?.examples)
          ? (parsed.examples.slice(0, 6) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        metrics: validation.metrics as unknown as Prisma.InputJsonValue,
        status: validation.ok ? 'proposed' : 'rejected',
        sourceSampleId: sample.id,
      },
    });

    await this.prisma.parseFailureSample.update({
      where: { id: sample.id },
      data: { status: 'proposed', proposalId: pattern.id },
    });

    return { pattern, validation };
  }

  async promote(patternId: string, reviewerId: string) {
    const existing = await this.prisma.learnedPattern.findUnique({ where: { id: patternId } });
    if (!existing) throw new NotFoundException('Pattern not found');
    if (existing.status === 'rejected') {
      throw new BadRequestException('Cannot promote a rejected pattern.');
    }
    const updated = await this.prisma.learnedPattern.update({
      where: { id: patternId },
      data: { status: 'promoted', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    if (existing.sourceSampleId) {
      await this.prisma.parseFailureSample.update({
        where: { id: existing.sourceSampleId },
        data: { status: 'promoted' },
      }).catch(() => undefined);
    }
    this.invalidateCache();
    return updated;
  }

  async reject(patternId: string, reviewerId: string) {
    const existing = await this.prisma.learnedPattern.findUnique({ where: { id: patternId } });
    if (!existing) throw new NotFoundException('Pattern not found');
    const updated = await this.prisma.learnedPattern.update({
      where: { id: patternId },
      data: { status: 'rejected', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    this.invalidateCache();
    return updated;
  }

  async rollback(patternId: string, reviewerId: string) {
    const updated = await this.prisma.learnedPattern.update({
      where: { id: patternId },
      data: { status: 'rolledback', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    this.invalidateCache();
    return updated;
  }

  /**
   * Hot-cached list of promoted patterns, filtered by kind. Field-mapper can
   * call this synchronously (best-effort) to enrich its rule set.
   */
  async getPromotedPatterns(kind?: PatternKind) {
    const now = Date.now();
    if (!this.patternCache || now - this.patternCache.at > PATTERN_CACHE_TTL_MS) {
      const rows = await this.prisma.learnedPattern.findMany({
        where: { status: 'promoted' },
        select: { kind: true, pattern: true, flags: true },
      });
      this.patternCache = { at: now, rows };
    }
    return kind ? this.patternCache.rows.filter((r) => r.kind === kind) : this.patternCache.rows;
  }

  private invalidateCache() {
    this.patternCache = null;
  }

  private async loadCorpus(): Promise<CorpusSample[]> {
    const rows = await this.prisma.parseFailureSample.findMany({
      orderBy: { createdAt: 'desc' },
      take: VALIDATION_CORPUS_LIMIT,
      select: { id: true, redactedText: true, verification: true },
    });
    return rows.map((r) => ({
      id: r.id,
      redactedText: r.redactedText,
      confidence: Number((r.verification as any)?.confidence ?? 0),
    }));
  }

  private resolveProvider(): AiProvider | null {
    const groqKey = this.config.get<string>('GROQ_API_KEY');
    if (groqKey) return new GroqProvider(groqKey);
    const xaiKey = this.config.get<string>('XAI_API_KEY');
    if (xaiKey) return new XaiProvider(xaiKey);
    return null;
  }
}

function safeParseJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
