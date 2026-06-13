const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildExtractionPrompt,
  parseExtractionResponse,
  clampConfidence,
  extractJsonObject,
  LlmDocumentExtractor,
  lowConfidenceFields,
} = require('../dist/index.js');

const schema = {
  name: 'invoice',
  description: 'A commercial invoice',
  fields: [
    { name: 'invoiceNumber', type: 'string', required: true, description: 'The invoice id' },
    { name: 'total', type: 'number', required: true },
    { name: 'currency', type: 'string', enum: ['USD', 'INR'] },
    { name: 'tags', type: 'string[]' },
  ],
};

// ── prompt ──────────────────────────────────────────────────────────
test('buildExtractionPrompt includes schema name, fields, and document text', () => {
  const { system, user } = buildExtractionPrompt(schema, { text: 'Invoice #A-100 total 50 USD', meta: { filename: 'a.pdf' } });
  assert.match(system, /invoice/);
  assert.match(system, /invoiceNumber: string \(required\)/);
  assert.match(system, /one of: USD, INR/);
  assert.match(user, /A-100/);
  assert.match(user, /FILENAME: a\.pdf/);
});

test('buildExtractionPrompt normalizes the document text', () => {
  const { user } = buildExtractionPrompt(schema, { text: 'diﬀ • x\nPage 1 of 2' });
  assert.match(user, /diff/);          // ligature repaired
  assert.match(user, /- x/);            // bullet normalized
  assert.ok(!/Page 1 of 2/.test(user)); // furniture dropped
});

// ── parse ───────────────────────────────────────────────────────────
test('clampConfidence clamps to 0..1', () => {
  assert.equal(clampConfidence(0.5), 0.5);
  assert.equal(clampConfidence(2), 1);
  assert.equal(clampConfidence(-1), 0);
  assert.equal(clampConfidence('x'), 0);
});

test('extractJsonObject tolerates code fences and prose', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n``` thanks'), { a: 1 });
  assert.equal(extractJsonObject('no json'), null);
});

test('parseExtractionResponse coerces types and records provenance', () => {
  const raw = JSON.stringify({
    fields: {
      invoiceNumber: { value: 'A-100', confidence: 0.95, evidence: 'Invoice #A-100' },
      total: { value: '50', confidence: 0.8 },           // string -> number
      currency: { value: 'USD', confidence: 1 },
      tags: { value: ['urgent', 2], confidence: 0.5 },    // coerced to strings
    },
  });
  const res = parseExtractionResponse(raw, schema);
  assert.equal(res.data.invoiceNumber, 'A-100');
  assert.strictEqual(res.data.total, 50);
  assert.deepEqual(res.data.tags, ['urgent', '2']);
  assert.equal(res.fields.invoiceNumber.evidence, 'Invoice #A-100');
  assert.equal(res.fields.invoiceNumber.source, 'llm');
  assert.equal(res.missingRequired.length, 0);
  // overall = mean of required (invoiceNumber 0.95, total 0.8) = 0.88 (rounded 2dp)
  assert.equal(res.overallConfidence, 0.88);
});

test('parseExtractionResponse flags missing required fields', () => {
  const raw = JSON.stringify({ fields: { currency: { value: 'INR', confidence: 0.9 } } });
  const res = parseExtractionResponse(raw, schema);
  assert.deepEqual(res.missingRequired.sort(), ['invoiceNumber', 'total']);
  assert.equal(res.data.invoiceNumber, null);
  assert.equal(res.fields.invoiceNumber.source, 'missing');
  assert.equal(res.overallConfidence, 0); // both required empty
});

test('parseExtractionResponse never throws on garbage', () => {
  const res = parseExtractionResponse('not json at all', schema);
  assert.equal(res.data.invoiceNumber, null);
  assert.equal(res.missingRequired.length, 2);
  assert.equal(res.provider, 'llm');
});

// ── orchestrator with a mock client ─────────────────────────────────
test('LlmDocumentExtractor end-to-end with a mock LLM', async () => {
  const mockClient = {
    async extractJson({ system, user, jsonSchema }) {
      assert.ok(system.includes('invoice'));
      assert.ok(user.includes('A-777'));
      assert.equal(jsonSchema.type, 'object');
      return {
        raw: JSON.stringify({
          fields: {
            invoiceNumber: { value: 'A-777', confidence: 0.97 },
            total: { value: 1200, confidence: 0.9 },
            currency: { value: 'INR', confidence: 0.6 },
            tags: { value: [], confidence: 0 },
          },
        }),
      };
    },
  };
  const extractor = new LlmDocumentExtractor(mockClient);
  const res = await extractor.extract(schema, { text: 'Invoice #A-777 total 1200 INR' });
  assert.equal(res.data.invoiceNumber, 'A-777');
  assert.equal(res.data.total, 1200);
  assert.equal(res.overallConfidence, 0.94); // mean(0.97, 0.9)
  // currency 0.6 not below threshold; tags empty -> source 'missing' (conf 0)
  assert.deepEqual(lowConfidenceFields(res).sort(), ['tags']);
});

test('LlmDocumentExtractor validates the schema before calling the model', async () => {
  const extractor = new LlmDocumentExtractor({ async extractJson() { throw new Error('should not be called'); } });
  await assert.rejects(() => extractor.extract({ name: '', fields: [] }, { text: 'x' }), /name is required/);
});
