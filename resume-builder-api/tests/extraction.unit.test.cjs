const assert = require('node:assert/strict');
const test = require('node:test');
const { sanitizeExtractionRequest } = require('../dist/extraction/extraction.service.js');

const goodSchema = {
  name: 'invoice',
  fields: [
    { name: 'invoiceNumber', type: 'string', required: true },
    { name: 'total', type: 'number' },
  ],
};

test('accepts a valid request and caps text length', () => {
  const { schema, text } = sanitizeExtractionRequest({ schema: goodSchema, text: 'Invoice #1 total 50' });
  assert.equal(schema.name, 'invoice');
  assert.equal(text, 'Invoice #1 total 50');
  const long = sanitizeExtractionRequest({ schema: goodSchema, text: 'x'.repeat(40000) });
  assert.equal(long.text.length, 30000);
});

test('rejects missing text', () => {
  assert.throws(() => sanitizeExtractionRequest({ schema: goodSchema, text: '   ' }), /text .* is required/);
  assert.throws(() => sanitizeExtractionRequest({ schema: goodSchema }), /text .* is required/);
});

test('rejects missing or non-object schema', () => {
  assert.throws(() => sanitizeExtractionRequest({ text: 'hi' }), /schema .* is required/);
  assert.throws(() => sanitizeExtractionRequest({ text: 'hi', schema: [] }), /schema .* is required/);
});

test('surfaces schema validation errors as 400-friendly messages', () => {
  assert.throws(
    () => sanitizeExtractionRequest({ text: 'hi', schema: { name: 'x', fields: [{ name: 'a', type: 'nope' }] } }),
    /invalid type/,
  );
});

test('rejects too many top-level fields', () => {
  const fields = Array.from({ length: 41 }, (_, i) => ({ name: `f${i}`, type: 'string' }));
  assert.throws(() => sanitizeExtractionRequest({ text: 'hi', schema: { name: 'x', fields } }), /exceeds the limit/);
});
