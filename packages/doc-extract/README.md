# doc-extract

Document-agnostic, **schema-driven** structured extraction. Describe the data
you want as an `ExtractionSchema`, hand it any document's text, and get back
typed JSON with **per-field confidence + provenance** — for resumes, invoices,
contracts, forms, IDs, lab reports, anything.

This is the foundation for a future standalone "extract any data from any
document" library. It deliberately reuses the app's existing front-end and
agents instead of replacing them:

```
            ┌─────────────────────────── front-end (already in the app) ──────────────────────────┐
 PDF/DOCX ─►│ pdf-parse / mammoth / vision-OCR  (resume.service.ts: extractTextFromFile)           │─► raw text
   /image   └─────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼   normalizeDocumentText()  (shared cleanup)
            ┌──────────────────────────────── doc-extract (this package) ────────────────────────┐
            │  ExtractionSchema  ─►  toJsonSchema()  ─►  LlmClient (Anthropic)  ─►  parse + score  │─► ExtractionResult
            └──────────────────────────────────────────────────────────────────────────────────────┘
                                                   │  low-confidence fields
                                                   ▼
            ┌──────────── training agents (already in the app) ────────────┐
            │ PatternLearner + training-dataset  ◄── capture {text, schema, │  continuous improvement
            │ output, low-confidence fields} for review + model training    │
            └───────────────────────────────────────────────────────────────┘
```

Why a separate package: the resume pipeline (`packages/resume-intelligence`)
is a fast, rule-based path hardwired to the resume schema. `doc-extract`
generalizes to **arbitrary schemas** with an LLM backend — the rule path stays
for resumes (cheap, deterministic), the LLM path covers everything else.

## Quick start

```ts
import { LlmDocumentExtractor, type ExtractionSchema } from 'doc-extract';

const invoice: ExtractionSchema = {
  name: 'invoice',
  description: 'A commercial invoice',
  fields: [
    { name: 'invoiceNumber', type: 'string', required: true, description: 'The invoice id/number' },
    { name: 'total', type: 'number', required: true },
    { name: 'currency', type: 'string', enum: ['USD', 'INR', 'EUR'] },
    { name: 'lineItems', type: 'object[]', fields: [
      { name: 'description', type: 'string' },
      { name: 'amount', type: 'number' },
    ]},
  ],
};

const extractor = new LlmDocumentExtractor(anthropicClient); // see below
const result = await extractor.extract(invoice, { text: pdfText, meta: { filename: 'acme.pdf' } });

result.data;               // { invoiceNumber: 'A-100', total: 4200, currency: 'INR', lineItems: [...] }
result.fields.total;       // { confidence: 0.93, source: 'llm', evidence: 'Total ₹4,200' }
result.overallConfidence;  // 0.9
result.missingRequired;    // []
```

## The LLM seam (production wiring)

`LlmClient` is injected so this package has **no hard SDK dependency**, runs in
the API / a worker / the MCP server, and is unit-testable with a mock. In
production, wrap the Anthropic SDK and let structured outputs enforce the schema:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from 'doc-extract';

const sdk = new Anthropic();

export const anthropicClient: LlmClient = {
  async extractJson({ system, user, jsonSchema }) {
    const res = await sdk.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: jsonSchema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = res.content.find((b) => b.type === 'text');
    return { raw: text ? text.text : '' };
  },
};
```

Notes (from the Claude API guidance):
- **Model:** default `claude-opus-4-8`; use `claude-haiku-4-5` for high-volume,
  simple docs to cut cost.
- **Structured outputs:** `output_config.format` constrains the response to the
  generated JSON Schema, so `parseExtractionResponse` rarely has to repair.
- **Large/batch jobs:** for many documents, the Batches API runs at 50% cost;
  for very large `max_tokens`, stream.

## Plugging into the training loop

`lowConfidenceFields(result)` returns fields below `LOW_CONFIDENCE_THRESHOLD` —
the generalization of the resume PatternLearner's "learn from low-confidence
parses" idea. Capture `{ normalizedText, schema, result.data, lowConfidenceFields }`
(consented + PII-redacted, like the existing `training-dataset` module) to build
an evaluation/fine-tuning set that makes extraction better over time — for any
schema, not just resumes.

## API

| Export | Purpose |
|---|---|
| `LlmDocumentExtractor` | Orchestrator: `extract(schema, doc) → ExtractionResult` |
| `normalizeDocumentText` / `clampDocumentText` / `isPageFurniture` | Shared text cleanup (ligatures, bullets, page furniture, token cap) |
| `toJsonSchema` / `validateSchema` | Schema → JSON Schema for structured outputs; schema validation |
| `buildExtractionPrompt` | Deterministic system+user prompt builder |
| `parseExtractionResponse` / `extractJsonObject` / `clampConfidence` | Tolerant response → typed result with confidence/provenance |
| `lowConfidenceFields` / `LOW_CONFIDENCE_THRESHOLD` | Training-loop capture helper |

## Tests

```bash
npm test   # builds, then runs node --test on tests/*.test.cjs (20 tests)
```

Pure logic (normalize, schema, prompt, parse) is fully unit-tested; the
orchestrator is tested end-to-end with a mock `LlmClient`.
