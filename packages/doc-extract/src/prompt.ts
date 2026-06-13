/**
 * Prompt construction for schema-driven extraction. Pure + deterministic so it
 * unit-tests cleanly and caches well (a stable system prompt prefix).
 */

import type { ExtractionSchema, DocumentInput, FieldSpec } from './types.js';
import { normalizeDocumentText, clampDocumentText } from './normalize.js';

function describeField(f: FieldSpec, indent = ''): string[] {
  const lines: string[] = [];
  const req = f.required ? ' (required)' : '';
  const en = f.enum && f.enum.length ? ` [one of: ${f.enum.join(', ')}]` : '';
  const desc = f.description ? ` — ${f.description}` : '';
  lines.push(`${indent}- ${f.name}: ${f.type}${req}${en}${desc}`);
  if (f.fields && f.fields.length) {
    for (const child of f.fields) lines.push(...describeField(child, `${indent}  `));
  }
  return lines;
}

/** Build the system + user prompts for an extraction request. */
export function buildExtractionPrompt(
  schema: ExtractionSchema,
  doc: DocumentInput,
): { system: string; user: string } {
  const fieldList = schema.fields.flatMap((f) => describeField(f)).join('\n');

  const system = [
    'You are a precise document data-extraction engine.',
    `Extract structured data from a "${schema.name}" document.`,
    schema.description ? `Context: ${schema.description}` : '',
    '',
    'Return JSON matching the provided schema exactly. For EVERY requested field return',
    'an object { "value": ..., "confidence": 0..1, "evidence": "<short verbatim snippet>" }.',
    'Rules:',
    '  - Extract only what the document supports. Never invent or guess values.',
    '  - If a field is absent, set value to null and confidence to 0.',
    '  - confidence reflects how certain you are the value is correct and complete.',
    '  - evidence is a short verbatim quote from the document that supports the value.',
    '  - Respect the requested type and any enum constraints.',
    '',
    'Fields to extract:',
    fieldList,
  ].filter(Boolean).join('\n');

  const text = clampDocumentText(normalizeDocumentText(doc.text));
  const metaLine = doc.meta?.filename ? `FILENAME: ${doc.meta.filename}\n` : '';
  const user = `${metaLine}DOCUMENT:\n"""\n${text}\n"""`;

  return { system, user };
}
