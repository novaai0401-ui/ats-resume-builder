/**
 * Core types for document-agnostic, schema-driven extraction.
 *
 * The design goal: extract *any* structured data from *any* document by
 * describing the target shape as an ExtractionSchema, rather than hardcoding a
 * resume mapper. The resume pipeline (packages/resume-intelligence) stays as a
 * fast, rule-based path for the resume schema; this package generalizes to
 * invoices, contracts, forms, IDs, lab reports — anything — via an LLM backend.
 */

/** Supported field shapes. Kept small + JSON-Schema-translatable on purpose. */
export type FieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'string[]'
  | 'object'
  | 'object[]';

export interface FieldSpec {
  /** Field key in the output object. Must be unique within its level. */
  name: string;
  type: FieldType;
  /** Plain-language description — the single biggest lever on LLM accuracy. */
  description?: string;
  /** When true, a missing value lowers overall confidence and is surfaced. */
  required?: boolean;
  /** Allowed values for a string field (becomes a JSON-Schema enum). */
  enum?: string[];
  /** Nested field specs for `object` / `object[]` types. */
  fields?: FieldSpec[];
}

export interface ExtractionSchema {
  /** Human/document-type name, e.g. "invoice", "resume", "lab_report". */
  name: string;
  description?: string;
  fields: FieldSpec[];
}

/** The text (and optional metadata) of one document to extract from. */
export interface DocumentInput {
  /** Plain text of the document — from pdf-parse, mammoth, or vision-OCR. */
  text: string;
  /** Optional context that improves extraction (filename, mime, language). */
  meta?: {
    filename?: string;
    mimeType?: string;
    language?: string;
    [k: string]: unknown;
  };
}

/** Where a field's value came from, for auditability + agent training. */
export type FieldSource = 'llm' | 'rule' | 'merged' | 'missing';

export interface FieldProvenance {
  /** 0..1 — model/rule confidence for this field. */
  confidence: number;
  source: FieldSource;
  /** Optional snippet the value was derived from (for review + training). */
  evidence?: string;
}

export interface ExtractionResult<T = Record<string, unknown>> {
  schemaName: string;
  /** The extracted, type-coerced data object. */
  data: T;
  /** Per-field confidence + provenance, keyed by field name. */
  fields: Record<string, FieldProvenance>;
  /** Mean confidence across required fields (0..1). */
  overallConfidence: number;
  /** Fields the schema marked required but extraction could not fill. */
  missingRequired: string[];
  provider: 'llm' | 'rule-based';
}

/**
 * Minimal LLM seam. Production wires this to the Anthropic SDK:
 *
 *   const res = await client.messages.parse({
 *     model: "claude-opus-4-8",
 *     max_tokens: 16000,
 *     thinking: { type: "adaptive" },
 *     output_config: { format: { type: "json_schema", schema: jsonSchema } },
 *     messages: [{ role: "user", content: `${system}\n\n${user}` }],
 *   });
 *   return { raw: textBlock(res) };
 *
 * Keeping it injectable means this package has no hard SDK dependency, runs in
 * any client (API, worker, MCP server), and is unit-testable with a mock.
 */
export interface LlmClient {
  extractJson(args: {
    system: string;
    user: string;
    /** JSON Schema for output_config.format / strict structured output. */
    jsonSchema: Record<string, unknown>;
  }): Promise<{ raw: string }>;
}
