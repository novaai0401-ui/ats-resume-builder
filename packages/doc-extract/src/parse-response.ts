/**
 * Turn a raw LLM JSON response into a typed ExtractionResult with per-field
 * confidence + provenance. Tolerant of code fences / stray prose, coerces to the
 * declared types, clamps confidence, and reports missing required fields.
 */

import type {
  ExtractionSchema,
  ExtractionResult,
  FieldSpec,
  FieldProvenance,
  FieldSource,
} from './types.js';

export function clampConfidence(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Extract the first balanced JSON object from arbitrary text. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  try {
    return JSON.parse(raw.slice(first, last + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerce(value: unknown, field: FieldSpec): unknown {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'string':
      return typeof value === 'string' ? value : String(value);
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'integer': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return null;
    case 'string[]':
      return Array.isArray(value) ? value.map((x) => String(x)).filter(Boolean) : null;
    case 'object':
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    case 'object[]':
      return Array.isArray(value) ? value.filter((x) => x && typeof x === 'object') : null;
    default:
      return value;
  }
}

/** Parse a raw model response against the schema. Always returns a result. */
export function parseExtractionResponse(
  raw: string,
  schema: ExtractionSchema,
  source: FieldSource = 'llm',
): ExtractionResult {
  const obj = extractJsonObject(raw);
  const fieldsObj = (obj?.fields as Record<string, unknown>) || {};

  const data: Record<string, unknown> = {};
  const fields: Record<string, FieldProvenance> = {};
  const missingRequired: string[] = [];

  for (const spec of schema.fields) {
    const entry = fieldsObj[spec.name] as Record<string, unknown> | undefined;
    const coerced = coerce(entry?.value, spec);
    const isEmpty =
      coerced === null ||
      (Array.isArray(coerced) && coerced.length === 0) ||
      coerced === '';

    data[spec.name] = coerced;
    if (isEmpty) {
      fields[spec.name] = { confidence: 0, source: 'missing' };
      if (spec.required) missingRequired.push(spec.name);
    } else {
      fields[spec.name] = {
        confidence: clampConfidence(entry?.confidence),
        source,
        evidence: typeof entry?.evidence === 'string' ? entry.evidence.slice(0, 300) : undefined,
      };
    }
  }

  const required = schema.fields.filter((f) => f.required);
  const overallConfidence =
    required.length === 0
      ? meanConfidence(Object.values(fields))
      : meanConfidence(required.map((f) => fields[f.name]));

  return {
    schemaName: schema.name,
    data,
    fields,
    overallConfidence,
    missingRequired,
    provider: source === 'rule' ? 'rule-based' : 'llm',
  };
}

function meanConfidence(provs: FieldProvenance[]): number {
  if (provs.length === 0) return 0;
  const sum = provs.reduce((acc, p) => acc + (p?.confidence ?? 0), 0);
  return Math.round((sum / provs.length) * 100) / 100;
}
