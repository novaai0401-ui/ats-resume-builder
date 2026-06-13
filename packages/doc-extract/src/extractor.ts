/**
 * The orchestrator: schema + document → typed ExtractionResult.
 *
 * Document-agnostic and provider-agnostic. The LLM backend is injected
 * (LlmClient), so this runs in the API, a worker, or the MCP server with no
 * hard SDK dependency and is unit-testable with a mock. In production the
 * client wraps the Anthropic SDK (claude-opus-4-8, output_config.format,
 * adaptive thinking) — see AnthropicLlmClient in the README.
 */

import type {
  ExtractionSchema,
  DocumentInput,
  ExtractionResult,
  LlmClient,
} from './types.js';
import { validateSchema, toJsonSchema } from './schema.js';
import { buildExtractionPrompt } from './prompt.js';
import { parseExtractionResponse } from './parse-response.js';

export class LlmDocumentExtractor {
  constructor(private readonly client: LlmClient) {}

  /**
   * Extract `schema` from `doc`. Throws only on invalid schema or a thrown
   * client; a malformed model response yields a low-confidence result rather
   * than throwing, so callers always get a structured answer to inspect.
   */
  async extract(schema: ExtractionSchema, doc: DocumentInput): Promise<ExtractionResult> {
    validateSchema(schema);
    const { system, user } = buildExtractionPrompt(schema, doc);
    const jsonSchema = toJsonSchema(schema);
    const { raw } = await this.client.extractJson({ system, user, jsonSchema });
    return parseExtractionResponse(raw, schema, 'llm');
  }
}

/**
 * Fields below this confidence are good candidates to capture for the training
 * loop (PatternLearner / training-dataset) — the same "learn from low-confidence
 * parses" idea the resume pipeline already uses, generalized to any schema.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function lowConfidenceFields(result: ExtractionResult): string[] {
  return Object.entries(result.fields)
    .filter(([, p]) => p.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map(([name]) => name);
}
