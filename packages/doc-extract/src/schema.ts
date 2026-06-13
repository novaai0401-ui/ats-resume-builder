/**
 * ExtractionSchema → JSON Schema, and schema validation.
 *
 * The LLM is asked to return, for every requested field, an object
 * `{ value, confidence, evidence }` so we capture provenance inline. This
 * module builds the strict JSON Schema for `output_config.format` and validates
 * the caller's ExtractionSchema before we ever hit the model.
 */

import type { ExtractionSchema, FieldSpec, FieldType } from './types.js';

const SCALAR: Record<string, Record<string, unknown>> = {
  string: { type: 'string' },
  number: { type: 'number' },
  integer: { type: 'integer' },
  boolean: { type: 'boolean' },
};

function valueSchemaFor(field: FieldSpec): Record<string, unknown> {
  switch (field.type) {
    case 'string':
      return field.enum && field.enum.length
        ? { type: 'string', enum: field.enum }
        : { type: 'string' };
    case 'number':
    case 'integer':
    case 'boolean':
      return SCALAR[field.type];
    case 'string[]':
      return { type: 'array', items: { type: 'string' } };
    case 'object':
      return objectValueSchema(field.fields ?? []);
    case 'object[]':
      return { type: 'array', items: objectValueSchema(field.fields ?? []) };
    default:
      return { type: 'string' };
  }
}

function objectValueSchema(fields: FieldSpec[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const f of fields) properties[f.name] = valueSchemaFor(f);
  return {
    type: 'object',
    properties,
    required: fields.map((f) => f.name),
    additionalProperties: false,
  };
}

/**
 * Build the JSON Schema for the model response. Shape:
 *   { fields: { <name>: { value, confidence, evidence } , ... } }
 */
export function toJsonSchema(schema: ExtractionSchema): Record<string, unknown> {
  const fieldProps: Record<string, unknown> = {};
  for (const f of schema.fields) {
    fieldProps[f.name] = {
      type: 'object',
      properties: {
        value: valueSchemaFor(f),
        confidence: { type: 'number' },
        evidence: { type: 'string' },
      },
      required: ['value', 'confidence'],
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    properties: {
      fields: {
        type: 'object',
        properties: fieldProps,
        required: schema.fields.map((f) => f.name),
        additionalProperties: false,
      },
    },
    required: ['fields'],
    additionalProperties: false,
  };
}

const VALID_TYPES = new Set<FieldType>([
  'string', 'number', 'integer', 'boolean', 'string[]', 'object', 'object[]',
]);

/** Validate an ExtractionSchema; throws with a clear message on the first error. */
export function validateSchema(schema: ExtractionSchema): void {
  if (!schema || typeof schema.name !== 'string' || !schema.name.trim()) {
    throw new Error('ExtractionSchema.name is required.');
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new Error('ExtractionSchema.fields must be a non-empty array.');
  }
  validateFields(schema.fields, schema.name);
}

function validateFields(fields: FieldSpec[], path: string): void {
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f || typeof f.name !== 'string' || !f.name.trim()) {
      throw new Error(`${path}: every field needs a non-empty name.`);
    }
    if (seen.has(f.name)) throw new Error(`${path}: duplicate field "${f.name}".`);
    seen.add(f.name);
    if (!VALID_TYPES.has(f.type)) {
      throw new Error(`${path}.${f.name}: invalid type "${f.type}".`);
    }
    if ((f.type === 'object' || f.type === 'object[]')) {
      if (!Array.isArray(f.fields) || f.fields.length === 0) {
        throw new Error(`${path}.${f.name}: ${f.type} requires nested "fields".`);
      }
      validateFields(f.fields, `${path}.${f.name}`);
    }
  }
}
