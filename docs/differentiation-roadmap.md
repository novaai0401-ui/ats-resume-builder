# Differentiation Roadmap — Implementation Notes

This document tracks the features built on branch `claude/gallant-knuth-fKlMx`
to move the product from "another ATS resume builder" to one with
defensible, compounding moats.

The companion strategy doc explains *why* these features were chosen. This
doc explains *what was built*, *where it lives*, and *how to operate it*.

---

## Phase 1 — PatternLearnerAgent (capture + propose)

**Goal.** Make the parser get smarter every time it sees a resume it
struggles with — a compounding moat competitors don't have, because they
mostly outsource parsing to third-party services.

### What was built

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` (additions) | `ParseFailureSample`, `LearnedPattern` |
| `prisma/migrations/20260528120000_add_pattern_learner/migration.sql` | DDL |
| `src/pattern-learner/redact.ts` | PII scrubber (emails / phones / URLs / long digit runs) |
| `src/pattern-learner/known-pattern-kinds.ts` | Whitelist of extraction targets |
| `src/pattern-learner/pattern-validator.ts` | Sandboxed compile + corpus regression check |
| `src/pattern-learner/pattern-proposer.prompt.ts` | LLM system prompt + JSON contract |
| `src/pattern-learner/pattern-learner.service.ts` | Capture, propose, promote, reject, rollback, hot cache |
| `src/pattern-learner/pattern-learner.controller.ts` | Admin endpoints |
| `src/pattern-learner/pattern-learner.module.ts` | Nest module |
| `src/resume/resume.service.ts` (edits) | Fire-and-forget capture hook |
| `src/resume/resume.controller.ts` (edits) | Pass `userId` into the capture |

### Safety properties

* PII is scrubbed before any sample is persisted.
* Pattern validator rejects nested-quantifier shapes (ReDoS).
* Regex match is time-bounded (50 ms) against a length-capped input (8 KB).
* A proposal is auto-`rejected` if it matches ANY high-confidence sample
  in the corpus that was already parsing cleanly — zero-regression rule.
* Capture is fire-and-forget; a learner failure never breaks an upload.

### Admin API (JwtAuthGuard + AdminAuthGuard)

```
GET    /admin/pattern-learner/failures?status=open
GET    /admin/pattern-learner/patterns?status=proposed
POST   /admin/pattern-learner/failures/:id/propose      { kind }
POST   /admin/pattern-learner/patterns/:id/promote
POST   /admin/pattern-learner/patterns/:id/reject
POST   /admin/pattern-learner/patterns/:id/rollback
```

---

## Phase 1.5 — Salvage pass

**Goal.** Actually apply promoted patterns at parse time so the learning
loop produces user-visible improvements.

### What was built

| File | Purpose |
| --- | --- |
| `src/pattern-learner/pattern-applier.ts` | Fill-only post-processing for `contact.phone`, `contact.location`, `education.degree` |
| `src/resume/resume.service.ts` (edits) | Feature-flagged salvage pass invocation |

### Safety properties

* **Never overwrites** a field the primary extractor produced.
* Off by default; enable with `PATTERN_LEARNER_APPLY=true`.
* Salvage report is attached to the upload's `debug` payload and logged
  with a before/after diff in non-production.
* Reuses the validator's safe-compile guard.

---

## Phase 2 — Sahaayak (emotional companion with memory)

**Goal.** A structural moat against ChatGPT/Claude. A stateless chat
cannot remember the user's rejections, mood, or guardrails across
sessions; this can.

### What was built

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` (additions) | `SahaayakProfile`, `SahaayakEvent`, `SahaayakMessage` |
| `prisma/migrations/20260528130000_add_sahaayak/migration.sql` | DDL |
| `src/sahaayak/crisis-detector.ts` | Regex-based despair-language detector + India/US/UK resource routing |
| `src/sahaayak/memory-summarizer.ts` | Deterministic pattern detection (industry-cluster rejections, sustained low mood, interview silence) |
| `src/sahaayak/sahaayak.prompt.ts` | Witness / Coach / Karmayoga personas |
| `src/sahaayak/sahaayak.service.ts` | Opt-in, chat, events, check-in, forget |
| `src/sahaayak/sahaayak.controller.ts` | REST surface |
| `src/sahaayak/sahaayak.module.ts` | Nest module |

### Safety properties

* **Explicit opt-in** required; no memory writes without it.
* **Hard-delete endpoint** for right-to-be-forgotten.
* Crisis detector runs **regardless of LLM availability** — if Groq is
  down, distress signals still surface real resources.
* User turn is persisted *before* the LLM call, so distress isn't lost
  on timeout.
* Karmayoga mode is explicitly forbidden from quoting scripture unprompted.
* High-recall by design on crisis detection: false positives are cheaper
  than misses.

### REST surface (JwtAuthGuard)

```
GET    /sahaayak/profile
POST   /sahaayak/opt-in        { mode, guardrails }
POST   /sahaayak/opt-out
DELETE /sahaayak/memory
POST   /sahaayak/chat          { message, region }
GET    /sahaayak/messages
POST   /sahaayak/events        { kind, payload, note, moodRating }
GET    /sahaayak/events
GET    /sahaayak/check-in
```

---

## Phase 3 — Web UI

**Goal.** Make Phase 1 and 2 reachable to real users and admins.

### What was built

| File | Purpose |
| --- | --- |
| `src/lib/api.ts` (additions) | Typed client methods for sahaayak.* and admin pattern-learner.* |
| `src/components/TopNav.tsx` (edits) | Nav entry for `/sahaayak` |
| `app/sahaayak/page.tsx` + `SahaayakClient.tsx` | Opt-in card, chat thread, event logger, crisis surface, calm UX |
| `app/admin/pattern-review/page.tsx` + `PatternReviewView.tsx` | Failure browser, propose-and-validate flow, registry table |

### UX choices worth keeping

* No streaks, no badges, no progress meters on Sahaayak — quiet by design.
* Crisis card is dismissible per-conversation, but the resource footer
  is always reachable.
* Pattern review shows precision / recall / regression count inline so
  the admin sees evidence before promoting.

---

## Phase 4 — Outcome Loop

**Goal.** Turn the existing job tracker into a proof engine. Beats every
competitor's "ATS score theater" because the numbers are observed, not
predicted.

### What was built

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` (edits) | `JobApplication.resumeVersionId` |
| `prisma/migrations/20260528140000_add_outcome_link/migration.sql` | DDL |
| `src/jobs/jobs.service.ts` (edits) | Accepts `resumeVersionId` on create/update |
| `src/resume/outcome-stats.ts` | Pure stats: per-version response/interview/offer rates, baseline/top lift |
| `src/resume/outcomes.service.ts` | Glue + auth |
| `src/resume/resume.controller.ts` (edits) | `GET /resumes/:id/outcomes` |
| `resume-builder-web/app/resume/outcomes/*` | Resume picker + headline card + per-version table |
| `resume-builder-web/src/lib/api.ts` (edits) | `getResumeOutcomes` |

### Honesty properties

* `MIN_SAMPLE_SIZE = 5` — below this, rates render as `—`, not as
  manufactured precision.
* Baseline = the **oldest significant** version (matches user mental
  model: "is my rewrite working?").
* Lift reported as **multiplier AND percentage-point delta** so both
  relative and absolute scale are visible.
* `wishlist` excluded from denominator; never reached a recruiter so it
  is signal-free.
* Unattributed applications surfaced separately so users know what to
  backfill.

---

## Phase 5 — ATS Simulator

**Goal.** Show the user the literal text a real ATS will hand to a
recruiter — not a keyword score, the actual recruiter view. None of the
incumbents do this; Jobscan and Teal both rely on keyword math instead.

### What was built

| File | Purpose |
| --- | --- |
| `src/resume/ats-simulator.ts` | Pure simulator: recruiter view + risk list + confidence |
| `src/resume/resume.controller.ts` (edits) | `GET /resumes/:id/ats-simulate` |
| `tests/ats-simulator.unit.test.cjs` | 8 unit tests |
| `resume-builder-web/app/resume/ats-simulate/*` | UI: recruiter view + risks panel + captured-fields table |
| `resume-builder-web/src/lib/api.ts` (edits) | `simulateAts` client |

### Risk kinds detected

`contact-missing-name`, `contact-missing-email`, `contact-missing-phone`,
`summary-too-long`, `summary-wall-of-text`, `bullet-too-long`,
`bullet-weak-starter`, `experience-no-dates`,
`experience-non-chronological`, `education-no-dates`, `skills-too-few`,
`skills-too-many`, `creative-date-format`. Each risk has a severity
(high / medium / low) and an optional field path so the UI can
deep-link to the offending field in a future iteration.

### Honesty properties

* Confidence is a transparent penalty function (high=14, medium=7,
  low=3) — not a black-box score.
* Risks are sorted high-severity first. The high ones are the ones
  most likely to drop the candidate from a Workday/Greenhouse req.
* Missing fields are rendered as explicit "(missing)" tokens in the
  fields table — so the user sees the holes their resume has.

---

## Test results

**37/37 new unit tests pass** (run `node --test tests/<name>.cjs`):

| File | Tests | Status |
| --- | --- | --- |
| `tests/pattern-learner-validator.unit.test.cjs` | 5 | ✅ all pass |
| `tests/pattern-learner-applier.unit.test.cjs` | 4 | ✅ all pass |
| `tests/sahaayak-crisis-detector.unit.test.cjs` | 7 | ✅ all pass |
| `tests/sahaayak-memory-summarizer.unit.test.cjs` | 5 | ✅ all pass |
| `tests/outcome-stats.unit.test.cjs` | 7 | ✅ all pass + reconciliation |
| `tests/ats-simulator.unit.test.cjs` | 8 | ✅ all pass |

The full repo suite reports 42 failures — all in pre-existing tests
(`auth-*`, `ats-*`, `google-oauth`, `payment-gate`, `prisma-service`,
`rate-limit`, `pdf-render`). Verified those same failures reproduce on
the commit before Phase 1, so they are baseline issues unrelated to this
work — most are out-of-date Nest test modules missing recently-added
providers.

---

## Phase 6 — Browser extension (Manifest V3)

**Goal.** Meet users where the stress happens — the job board itself —
and close the Outcome Loop's data gap without manual backfill.

### Three differentiators

1. **Auto-attribute applications.** On supported job boards, when the
   user clicks "Apply", the extension surfaces a one-click "track this"
   prompt that creates a `JobApplication` with `resumeVersionId` already
   set. The Outcome Loop populates without users having to remember.
2. **Recruiter-view overlay.** On any job posting, the extension can
   render the ATS Simulator output of the user's resume against THIS
   specific JD (confidence + top risks + recruiter-view text).
3. **Sahaayak in the corner.** The popup contains a small chat surface
   so the emotional companion is reachable without leaving the page.

### File layout

```
resume-builder-extension/
├── manifest.json          Manifest V3
├── background.js          Service worker — auth + API proxy + context menu
├── popup.html / .css / .js   Action popup (Sahaayak chat)
├── options.html / .js     API base + access token settings
├── content/
│   ├── job-board.js       Content script: JD capture + apply-button hook + overlay
│   └── overlay.css        Namespaced .atsb-* styles
├── lib/
│   └── api.js             Shared ES-module API client
└── README.md
```

### Permissions justification

- `storage` — caches the access token and API base.
- `activeTab` — read the JD only when the user explicitly clicks the
  extension.
- `scripting` — inject the overlay on demand.
- `contextMenus` — right-click "Send selection to ATS Builder".
- `host_permissions` — restricted to the job boards we support; the
  `https://*/*` wildcard in the manifest is for local dev only and
  should be tightened before publishing.

### Privacy properties

- Auth token lives in `chrome.storage.local` — sync-disabled, machine-local.
- Content scripts NEVER hold the token; all authenticated API calls go
  through the service worker via `chrome.runtime.sendMessage`.
- We do not auto-submit, auto-click apply, or scrape resumes from sites.
  We observe page text and offer actions; nothing happens without an
  explicit user click.

### How to load (dev)

1. `chrome://extensions` → enable Developer mode.
2. "Load unpacked" → pick `resume-builder-extension/`.
3. Open the options page, paste the access token from the web app
   (DevTools → Application → Local Storage → `accessToken`).

---

## Phase 7 — Local-first storage (DESIGN, NOT YET BUILT)

**Goal.** Honor the privacy commitment: resumes live on the user's
device, not in Postgres.

### Current state (honest assessment)

Today the `Resume` model in `prisma/schema.prisma` stores the full
structured payload: contact (JSON), skills array, sections (JSON with
summary / experience / education / projects / certifications),
templateId, etc. `ResumeVersion` snapshots are also Postgres-backed.
**The architecture as it stands does not meet the stated privacy goal.**

### Plan: fully local-first (chosen direction)

| Concern | Plan |
| --- | --- |
| Storage | IndexedDB (`atsbuilder` DB, `resumes` and `versions` object stores). Wrap with a tiny CRUD layer in `resume-builder-web/src/lib/local-resume-store.ts`. |
| Server-side `Resume` model | Repurpose as a stable-ID-only stub: `id`, `userId`, `createdAt`. The PAYLOAD column moves out. Migration drops the JSON columns and the old data must be exported by users beforehand (one-time email + in-app banner). |
| `ResumeVersion` | Same treatment: server keeps `id` + `resumeId` + `createdAt` as a stable reference target for `JobApplication.resumeVersionId`; the payload lives only on the device that created it. |
| Server features that need resume content (ATS critique, cover letter, JD match) | Client sends `resumeText` in the request body each call — already supported by some endpoints, needs widening to others. |
| ATS Simulator | Move `src/resume/ats-simulator.ts` into a shared package so it can run client-side against the local payload. The pure-function design from Phase 5 makes this trivial. |
| Outcome Loop | Unaffected. `JobApplication.resumeVersionId` is a reference; the server never needed the content. |
| PatternLearnerAgent | Unaffected. Captures redacted text at upload moment, before any persistence decision. |
| Sahaayak | Unaffected. Has no coupling to the Resume model. |
| Sync between devices | Out of scope for v1. Add later via the user's own cloud (Drive / Dropbox token), encrypted before upload. |

### Risks and mitigations

- **Device loss = data loss.** Add a one-click "export as .career.json"
  in the editor, and remind users on first save. Optionally let them
  paste a backup hash into their email.
- **Existing users.** Current Postgres data must be migrated to the
  device on first login post-deploy. Banner: "We are moving your resume
  to your device for privacy. Click to import." A one-time GET fetches
  the payload, then the server payload is wiped.
- **Mobile native app.** When the React Native app ships, it will need
  parity local storage (SQLite or AsyncStorage). Keep the local store
  interface narrow so the implementation can vary per platform.

### Why this does NOT affect the agent learning loop

| Agent | Why it survives local-first |
| --- | --- |
| PatternLearner | Learns from parse failures captured at upload time. The redacted text + verification report are what it stores — independent of whether the parsed resume is later persisted to Postgres. |
| Sahaayak | Uses `SahaayakEvent` and `SahaayakMessage`, which are activity, not resume content. No change. |
| Outcome Loop | Uses `JobApplication.resumeVersionId` as a reference. The server needs only the ID, never the resume text. No change. |
| ATS Simulator | Pure function — runs anywhere. Moving it client-side removes one server round-trip. |
| AI Critique / Cover Letter | Already accept `resumeText` in the request body. The change is to make the client always send it, instead of relying on a server-side lookup by `resumeId`. |

---

## Operating notes

### Deploying the changes

```bash
# In resume-builder-api/
npx prisma migrate deploy   # applies the 3 new migrations
npx prisma generate         # regenerates the client with new models
```

### Required env

| Variable | Why |
| --- | --- |
| `GROQ_API_KEY` (already present) | Used by Sahaayak chat and pattern proposer |
| `PATTERN_LEARNER_APPLY` | Set to `true` to enable the salvage pass |

### Feature flags

* The salvage pass is dark-launchable. Leave `PATTERN_LEARNER_APPLY`
  unset until you have a few promoted patterns; even then, watch the
  `salvageReport` in upload logs for unexpected applies before going wide.

### Operating the learning loop

1. Users upload resumes; low-confidence parses are captured silently.
2. Admin opens `/admin/pattern-review`, picks a sample, picks a kind,
   clicks **Propose pattern**.
3. The validator's metrics (precision / recall / regression count) show
   inline. If green, **Promote** moves it to the live registry.
4. With `PATTERN_LEARNER_APPLY=true`, the next failing upload of that
   shape gets the salvage fill.
5. If anything regresses, **Rollback** — cache invalidates immediately.

### Operating Sahaayak

* The feature is opt-in only; nobody who didn't agree gets memory.
* `DELETE /sahaayak/memory` is hard-delete and irrecoverable. Make sure
  the UI confirms.
* Crisis detection is per-message and never silenced by mode choice.

### Operating the Outcome Loop

* Users need to set `resumeVersionId` on each new job application for
  the data to populate. The UI hint on `/resume/outcomes` ("N
  applications have no version attached") tells them.
* A future improvement: a one-time "tag your past applications" prompt
  that walks users through backfilling.
