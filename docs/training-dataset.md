# Phase 8 — Training dataset flywheel

The data foundation for the resume-parser model that becomes a sellable
library. Captures consented anonymized samples, auto-labels them from the
user's own confirmed-and-edited resume, and exports the corpus as JSONL
ready for fine-tuning a layout-aware document model (LayoutLMv3 / Donut /
custom transformer).

## Strategic position

This phase exists because we decided that **a) the parser library is the
product that monetizes** and **b) zero-knowledge encryption fights the
training data flywheel that library needs.** The tiered privacy plan:

| Tier | Storage | Training contribution |
| --- | --- | --- |
| Default | Server-side, encrypted-at-rest with our key | Opt-in at signup; can revoke any time |
| Private Mode (paid) | Zero-knowledge (vault code from earlier branch) | Excluded by construction — server cannot see the content |

This file documents the default-tier capture pipeline.

## What was built (Step 1 — Foundation)

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` (additions) | `User.trainingConsent` + `TrainingSample` + `ModelEvaluation` |
| `prisma/migrations/20260528160000_add_training_dataset/migration.sql` | DDL |
| `src/training-dataset/split-assignment.ts` | Deterministic stratified 80/10/10 split via sha256(format + id) |
| `src/training-dataset/jsonl-export.ts` | Stable JSONL schema for Hugging Face / label-studio import |
| `src/training-dataset/auto-labeler.ts` | Convert user-confirmed Resume payload into a gold-quality label; quality filter rejects low-signal labels |
| `src/training-dataset/training-dataset.service.ts` | Consent toggle, capture-upload, capture-confirmation, purge, stats, export |
| `src/training-dataset/training-dataset.controller.ts` | `PATCH /me/training-consent`, `DELETE /me/training-samples`, `GET /admin/training-dataset/stats`, `GET /admin/training-dataset/export.jsonl` |
| `src/training-dataset/training-dataset.module.ts` | Nest module |
| `tests/training-dataset.unit.test.cjs` | 10 unit tests covering split determinism, ratio approximation, JSONL shape, auto-labeler filters |

## Pipeline

```
Resume upload
  → server parses, returns structured extraction to client
  → if user.trainingConsent === true:
      → captureUpload(): redact PII → assign deterministic split →
        insert TrainingSample (status=pending, label=null)

User opens the editor, confirms / corrects fields, hits Save
  → captureConfirmation(): build structured label from confirmed payload
  → if isLabelHighEnoughQuality(label):
      → promote most-recent pending sample to status=labeled (auto label)
  → else:
      → leave as pending for manual review later

Admin clicks "Export"
  → GET /admin/training-dataset/export.jsonl
  → all labeled samples serialized as JSONL (one JSON object per line)
  → downloaded for offline training
```

## JSONL schema

```json
{
  "id": "ts_abc12345",
  "split": "train",
  "source_format": "pdf",
  "text": "PII-redacted raw text from the upload",
  "labels": {
    "contact": { "fullName": "...", "email": "...", "phone": "..." },
    "summary": "...",
    "skills": ["..."],
    "experience": [{ "role": "...", "company": "...", "startDate": "...",
                     "endDate": "...", "highlights": ["..."] }],
    "education": [...],
    "projects": [...],
    "certifications": [...]
  },
  "layout_hints": null
}
```

`text` carries no emails, phone numbers, URLs, or long digit runs — same
redactor as PatternLearner uses.

## Privacy and consent properties

| Property | Guarantee |
| --- | --- |
| Default behavior | `trainingConsent = false`. NO captures happen for a fresh user. |
| Consent versioning | `User.trainingConsentVersion` records which copy version the user agreed to. Bumped whenever wording changes. |
| Withdrawal | `PATCH /me/training-consent { enabled: false }` stops new captures immediately. |
| Purge | `DELETE /me/training-samples` is a hard delete of every TrainingSample for the user. |
| Internal capture only | Capture endpoints are NOT exposed externally. They run inside the upload + save flows, so external callers cannot seed arbitrary text into the corpus. |
| PII scrubbing | Emails, phones, URLs, long digit runs replaced with tokens before storage. |

## Split assignment

Stratified by source format. Deterministic so a sample always lands in
the same split, even across re-imports.

```ts
sha256(`${sourceFormat}:${sampleId}`)[0..2] % 100
  → 0..79  : train
  → 80..89 : val
  → 90..99 : test
```

Stratification by format means the val and test sets always contain a
proportional mix of PDFs / DOCXs / images — so a model that overfits to
one format gets caught.

## Test results — 10 / 10 pass

```
$ node --test tests/training-dataset.unit.test.cjs
# tests 10  # pass 10  # fail 0
```

Covered: split determinism, cross-format stratification, ratio
approximation on 1k samples, JSONL line shape (snake_case + null
handling), empty-iterable handling, label-quality filter (rejects
labels without contact, accepts contact + experience-OR-education),
experience entry quality (drops entries without role or company,
drops bullets below MIN_BULLET_LEN).

Cumulative across all phases on this branch: **47 / 47 unit tests pass.**

## What's NEXT (Step 2 onward)

| Step | Plan |
| --- | --- |
| 2 | Wire `captureUpload` into the existing resume upload flow + `captureConfirmation` into the resume save flow |
| 3 | Admin labeling UI for `status=pending` samples (review queue, side-by-side text + structured form, save as manual label) |
| 4 | Python training harness: load JSONL → tokenize → fine-tune LayoutLMv3 / Phi-3-mini → per-field metrics → write to `ModelEvaluation` |
| 5 | Model inference service (FastAPI on Modal) + `/extract` endpoint |
| 6 | Public SDKs (Python, Node) + Stripe billing + pricing |

## Cost / timeline estimate

| Phase | Effort |
| --- | --- |
| Steps 1-3 (capture + labeling) | 1-2 weeks |
| Steps 4-5 (training + inference) | 3-4 weeks, ~$1-3k GPU spend |
| Step 6 (productize) | 2-3 weeks |
| **Total to credible v1 of the library** | **8-12 weeks** |

This is the work that compounds into a defensible product.
