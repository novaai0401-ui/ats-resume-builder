# resume-pattern-model

A **self-learning resume pattern model**, packaged as an embeddable library.
No external ML runtime, no network calls, zero runtime dependencies.

It learns from the resumes it sees and uses what it learned to extract
structure from new resumes — the "OCR post-processing" layer that turns raw
text lines into sections, contact fields and split job headers.

## How it learns

1. **Weak supervision** — a built-in seed lexicon self-labels the obvious
   lines of every training resume (section headings, contact rows, bullets,
   date-carrying job headers). No hand labelling.
2. **Naive-Bayes line classifier** — the self-labels train a multinomial
   NB over token + shape features (`§allcaps`, `§daterange`, `§roleword`,
   `§bullet`, …). Every `learn()` call updates the counts, so accuracy
   grows with the corpus.
3. **Header-shape memory** — job-header lines are generalised into shape
   signatures (e.g. `T ORG , T ROLE DATERANGE`) with frequency counts; the
   most-seen shapes drive how new headers split into role/company/dates.

## API

```ts
import { createModel, ResumePatternModel } from 'resume-pattern-model';

const model = createModel();
model.learn(resumeText1);          // incremental — call as resumes flow in
model.learnMany([text2, text3]);

const out = model.extract(unseenResumeText);
// out.contact           → { name, email, phone }
// out.sections          → heading → lines
// out.experienceHeaders → [{ role, company, dates, shape }]
// out.confidence        → 0..1

const json = model.toJSON();                    // persist / ship as asset
const restored = ResumePatternModel.fromJSON(json);
restored.learn(more);                           // keeps learning
```

## Validated on real data

Trained on 2 real PDFs, extracting a third it never saw: name, email,
phone, 4/5 job headers, 0.97 line-classification confidence. Unit tests in
`tests/model.test.cjs` (8 cases: weak supervision, learning, shape memory,
extraction, JSON round-trip, incremental learning).

## Status / roadmap

v0.1 — line classes: heading / contact / bullet / job_header / body.
Not a replacement for the production parser (`resume-intelligence`); it is
the seed of a reusable learning layer. Natural next steps: education/skill
line classes, confidence-weighted merge with rule-based parsing, corpus
bootstrapping from the app's PatternLearner training samples.
