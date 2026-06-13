import { ForbiddenException, Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmDocumentExtractor,
  validateSchema,
  type LlmClient,
  type ExtractionSchema,
  type ExtractionResult,
} from 'doc-extract';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import { GroqProvider } from '../ai/providers/groq.provider';

/**
 * Generic document-extraction endpoint backing the doc-extract core.
 *
 * The LlmClient seam is wired to the provider this deployment actually has
 * keys for (Groq, JSON mode). Swapping to the Anthropic SDK later is a
 * one-file change — see packages/doc-extract/README.md.
 */

const APPROX_TOKENS = 1500;
const MAX_TEXT_CHARS = 30000;
const MAX_TOP_LEVEL_FIELDS = 40;

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async extract(userId: string, body: unknown): Promise<ExtractionResult> {
    const { schema, text } = sanitizeExtractionRequest(body);

    rateLimitOrThrow({
      key: `extract:${userId}`,
      limit: 15,
      windowMs: 60_000,
      message: 'Rate limit exceeded for extraction. Try again shortly.',
    });

    await this.checkAndCharge(userId, APPROX_TOKENS);

    const provider = this.resolveProvider();
    if (!provider) {
      throw new ForbiddenException('EXTRACTION_UNAVAILABLE: No AI provider is configured on this server.');
    }

    const client: LlmClient = {
      extractJson: async ({ system, user }) => {
        const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '25000'), 10);
        // GroqProvider sends response_format: json_object; our prompt already
        // specifies the exact { fields: { ... } } shape the parser expects.
        const raw = await provider.complete(system, user, { maxTokens: 4096, temperature: 0.2, timeoutMs });
        return { raw };
      },
    };

    try {
      const extractor = new LlmDocumentExtractor(client);
      return await extractor.extract(schema, { text });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Extraction failed: ${msg}`);
      throw new ForbiddenException('EXTRACTION_FAILED: Could not extract from this document. Try again.');
    }
  }

  private async checkAndCharge(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');

    const paymentFeatureEnabled = await this.settingsService.isPaymentFeatureEnabled();
    if (paymentFeatureEnabled && user.plan === 'FREE') {
      throw new ForbiddenException('FREE_PLAN_AI_BLOCKED: Document extraction requires Student or Pro.');
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

  private resolveProvider(): GroqProvider | null {
    const providerName = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (providerName !== 'groq') return null;
    const key = this.config.get<string>('GROQ_API_KEY', '');
    if (!key) return null;
    const model = this.config.get<string>('GROQ_MODEL', '');
    return new GroqProvider(key, model || undefined);
  }
}

// ── Pure request sanitizer (exported for tests) ─────────────────────

export function sanitizeExtractionRequest(body: unknown): { schema: ExtractionSchema; text: string } {
  const b = (body ?? {}) as { schema?: unknown; text?: unknown };
  const text = typeof b.text === 'string' ? b.text : '';
  if (!text.trim()) {
    throw new BadRequestException('text (the document content) is required.');
  }
  if (!b.schema || typeof b.schema !== 'object' || Array.isArray(b.schema)) {
    throw new BadRequestException('schema (an ExtractionSchema object) is required.');
  }
  const schema = b.schema as ExtractionSchema;
  if (Array.isArray(schema.fields) && schema.fields.length > MAX_TOP_LEVEL_FIELDS) {
    throw new BadRequestException(`schema.fields exceeds the limit of ${MAX_TOP_LEVEL_FIELDS}.`);
  }
  // Throws BadRequest-friendly message on a malformed schema.
  try {
    validateSchema(schema);
  } catch (err: unknown) {
    throw new BadRequestException(err instanceof Error ? err.message : 'Invalid schema.');
  }
  return { schema, text: text.slice(0, MAX_TEXT_CHARS) };
}
