# Pocket Resume — Master Requirements Registry

> **This file is THE pinned source of truth.** Every Claude session reads
> it via `CLAUDE.md` before touching anything. Don't re-derive a
> requirement from memory — open this file, find the ID, update its
> status, and link the commit.

**How this file works**

- Every requirement has a stable **ID** (`R-001`, `R-002`, …). Once
  assigned, IDs are immutable. Re-scopes happen as a new ID with a
  `Supersedes: R-XXX` line.
- Requirements are listed in **dependency order**. Item N cannot start
  until every item it lists in `Depends-on` is `DONE` (or explicitly
  waived in this file with a date and reason).
- Status legend (one of):
  - `DONE` — shipped, has merged commit(s) referenced.
  - `IN-PROGRESS` — actively being worked on this week.
  - `BLOCKED` — has unmet dependency or external decision pending.
  - `BACKLOG` — sequenced but not started.
  - `WAIVED` — explicitly skipped; reason recorded.
- Every requirement carries an **Acceptance** block. A requirement is
  not `DONE` until every acceptance bullet has an assertion in code,
  test, or a verified manual smoke step.
- When you edit code, find the requirement(s) it belongs to and:
  - Update the `Status` field.
  - Append the commit SHA to the `Commits` line.
  - If acceptance criteria changed, edit them here in the same commit.
- New work that doesn't fit any existing ID = add a new ID at the
  correct dependency position. Never silently expand an existing one.

**Index**

- §1 Foundation — already shipped on `claude/gallant-knuth-fKlMx`
- §2 Launch-blocking (this week)
- §3 Days 0–30 — close the Outcome flywheel
- §4 Days 30–60 — distribution + B2B pilot
- §5 Days 60–90 — monetize the graph
- §6 Cross-cutting constants (template, schema, privacy, accessibility)
- §7 Decisions log (waivers, scope changes)

---

## §1. Foundation — DONE on `claude/gallant-knuth-fKlMx`

These are the requirements already shipped on the launch branch. They
are listed so future work doesn't accidentally regress them — each
acceptance bullet IS the regression contract.

### R-001 · Honest privacy copy

- Status: **DONE**
- Commits: `b08dfda`
- Why: The "stays on this device / Cloud sync is opt-in" banner was
  false (parsing is server-side, autosave persists to Postgres). DPDP
  Act + Play Store data-safety risk if shipped.
- Acceptance
  - [x] `PrivacyBadge.tsx` copy for `upload` / `dashboard` / `download`
    / `login` variants names server-side parsing, account-scoped
    storage, HTTPS + at-rest encryption, no AI training without opt-in.
  - [x] Homepage hero strip + Settings privacy section match.
  - [x] No surface contains the phrase "stays on this device" or
    "Cloud sync is opt-in" until R-070 ships.

### R-002 · Visible upload loader

- Status: **DONE**
- Commits: `b08dfda`
- Acceptance
  - [x] `/resume/start` upload button shows the inline `DataLoader`
    spinner during parse.
  - [x] An `aria-live="polite"` status line below the button reads
    "Parsing your resume — this usually takes 5-15 seconds. Please
    keep this tab open." while `loadingUpload === true`.

### R-003 · Export quota enforcement (PDF + DOCX, all plans)

- Status: **DONE**
- Commits: `b08dfda`, `da29839`
- Acceptance
  - [x] `generatePdf` rejects with `ForbiddenException` containing the
    string `"Monthly export limit reached"` when `pdfExportsUsed + 1 >
    pdfExportsLimit`. No env-flag escape hatch.
  - [x] `generateDocx` shares the same counter and enforces the same
    ceiling. Increment happens only after the render succeeds.
  - [x] `tests/export-quota.unit.test.cjs` (4 tests) pin the contract.

### R-004 · `/templates` redirect (no 404)

- Status: **DONE**
- Commits: `2ff7ba4`
- Acceptance
  - [x] Visiting `/templates` returns 301/302 to `/templates/preview`.

### R-005 · Print-preview CSP fix

- Status: **DONE**
- Commits: `65c1dee`
- Acceptance
  - [x] `next.config.mjs` sets `frame-ancestors 'self'` (not `'none'`)
    and `X-Frame-Options: SAMEORIGIN` (not `DENY`).
  - [x] `tests/security-headers.test.ts` (5 tests) pin it; the
    Razorpay/Stripe `frame-src` allow-list is unchanged.

### R-006 · Editor field-persistence after autosave

- Status: **DONE**
- Commits: `b7716bb`
- Why: the post-autosave reset effect was wiping every field the user
  had just seen because the pending-upload guard had already cleared.
- Acceptance
  - [x] The reset effect in `ResumeEditor.tsx` gates on
    `shouldSkipServerHydration` against `locallySettledResumeIdRef`.
  - [x] `tests/editor-reset-gate.test.ts` (4 tests) pin the four
    transition cases.

### R-007 · Two-button upload landing

- Status: **DONE**
- Commits: `9232c1d`
- Acceptance
  - [x] After upload, the user sees both "Continue to Review" (→
    `/resume`) and "Review & ATS" (→ `/resume/review`).

### R-008 · Self-hosted analytics on every auth event

- Status: **DONE**
- Commits: `ae17477`
- Acceptance
  - [x] `AnalyticsService.track()` is fire-and-forget, no-ops when
    `AUDIT_URL` or `AUDIT_WRITE_KEY` is unset, never throws.
  - [x] `register` / `login` / `login_failed` / `logout` events fire
    from `AuthController` with end-user `x-forwarded-for` + `user-agent`
    forwarded to the sink.
  - [x] `tests/analytics-service.unit.test.cjs` (8 tests) pin it.

### R-009 · Billing page — Free-vs-Paid matrix + ₹49 explainer

- Status: **DONE**
- Commits: `64b3dca`
- Acceptance
  - [x] Side-by-side feature matrix renders on `/billing` with quotas
    that match `resume-builder-api/src/billing/plan-limits.ts` exactly.
  - [x] `MicroPaymentExplainer` card spells out what ₹49 unlocks
    (one PDF + Word, ATS scan, 15-min window, GST invoice).
  - [x] Prices show ₹199 / ₹499 (not the stale 399 / 799).
  - [x] `tests/plan-feature-comparison.test.ts` (7 tests) pin the
    numbers against the server's source of truth.

### R-010 · Parser — orphan soft-wrap word ≠ section heading

- Status: **DONE**
- Commits: `da29839`
- Why: `"frameworks."` (orphan word from Outspark's soft-wrap of the
  first Infosys bullet) was matching as a SKILLS heading; every
  Infosys bullet + achievement after it landed in the wrong section.
- Acceptance
  - [x] `isHeadingLike` rejects lines containing `.` `,` `;` `!` `?`
    unconditionally (the `KNOWN_HEADING_PHRASES` escape hatch is gone).
  - [x] Real headings (`Skills`, `Skills:`, `SKILLS`, `Frameworks`,
    `WORK EXPERIENCE`, `ACHIEVEMENTS`, `EDUCATION`) still register.
  - [x] `tests/heading-soft-wrap-orphan.cjs` (4 tests) pin it.
  - [x] Verified on Chandan resume: Experience #4 recovered from 1→13
    bullets; top-level achievements recovered from 0→2.

### R-011 · A11y primitives + loader sweep

- Status: **DONE**
- Commits: `9a5f4ac`, `f421cd6`, `4449201`
- Acceptance
  - [x] `SkipToContent`, `useFocusTrap`, `DataLoader` shipped with
    correct ARIA contracts; `SkipToContent` is a Client Component
    (event handlers).
  - [x] Wired into root layout + 7 data-fetching pages + 2 modals.

---

## §2. Launch-blocking (this week)

These must be `DONE` before the production deploy.

### R-020 · 10-step manual smoke pass on prod URL

- Status: **IN-PROGRESS** (waiting on founder)
- Depends-on: R-001 … R-011
- Owner: founder
- Reference: `docs/SMOKE_TEST_CHECKLIST.md` Parts A + B
- Blockers within the checklist (do NOT ship if any of these fail):
  - B4 — field persistence after refresh (regression guard for R-006)
  - B6 — 6th PDF download rejected (regression guard for R-003)
  - B10 — print preview opens with no CSP error (regression guard for R-005)

### R-021 · Production environment audit

- Status: **IN-PROGRESS**
- Depends-on: none
- Acceptance
  - [ ] `RAZORPAY_KEY_ID` starts with `rzp_live_` (startup guard refuses
    `rzp_test_…`).
  - [ ] `AUDIT_URL` and `AUDIT_WRITE_KEY` set; auth events arrive at
    the dashboard with the end-user's IP.
  - [ ] `DATABASE_URL` uses Supabase pooler (port 6543), `DIRECT_URL`
    uses 5432.
  - [ ] `SMTP_*` set; welcome / reset emails actually leave the box.
  - [ ] `STRIPE_SECRET_KEY` present (international fallback).
  - [ ] Build SHA on prod matches the launch branch's tip.

### R-022 · Deploy

- Status: **BLOCKED** by R-020, R-021
- Acceptance
  - [ ] Web + API + worker (if any) running on prod.
  - [ ] Health endpoints 200.
  - [ ] Real signup + upload + export round-trip works.

---

## §3. Days 0–30 — close the Outcome flywheel

Goal: every applied job feeds the Outcome Graph automatically. After
this milestone we can credibly say "this resume version got 2.4× more
replies than that one" — which is the moat.

### R-030 · Stable, pinned Template Architecture spec

- Status: **DONE**
- Commits: this commit
- Reference: `docs/TEMPLATE_SPEC.md`
- Why first: every other §3 requirement adds editor fields or rendered
  surfaces. If templates don't have a stable contract they all break.
- Acceptance
  - [x] `TEMPLATE_SPEC.md` lists the section contract, the styling
    contract, the i18n contract, the metadata contract.
  - [x] Every template in the registry must declare its supported
    section keys + ATS-safety level + supported locales.

### R-031 · Outcome-status nudge

- Status: **BACKLOG**
- Depends-on: R-022
- Acceptance
  - [ ] A worker job, daily, finds `JobApplication.status='applied'`
    where `appliedAt < now - 7d` and `status` hasn't advanced.
  - [ ] Sends one email + one push (web push if subscribed) with three
    one-tap buttons: `[No reply]` `[Rejected]` `[Interview!]`.
  - [ ] Each button hits an unauthenticated signed-link endpoint that
    advances the application's `status` and 302s to a friendly
    confirmation page.
  - [ ] Tokens are single-use, expire in 30 days.
  - [ ] Unsubscribe link in every email; respected globally.

### R-032 · Mail-in outcome capture

- Status: **BACKLOG**
- Depends-on: R-031
- Acceptance
  - [ ] User can forward rejection / interview emails to
    `track@pocketresume.app`.
  - [ ] Parser detects "unfortunately…", "shortlisted", "interview at",
    "offer extended" and matches to the most-recent matching
    `JobApplication` by company name.
  - [ ] Disambiguation: if multiple candidates match, email the user
    a "which application is this about?" link.
  - [ ] All received content is logged with a 30-day retention default.

### R-033 · Browser extension MVP to Chrome Web Store

- Status: **BACKLOG**
- Depends-on: R-022
- Reference: existing `resume-builder-extension/`
- Acceptance
  - [ ] Auth handshake replaces the "paste your JWT" step with an OAuth-style
    token exchange against the API.
  - [ ] JD capture on LinkedIn, Naukri, Indeed, Wellfound — verified
    on 3 listings each.
  - [ ] Apply-click hook fires the "which resume version?" prompt and
    creates a `JobApplication` with `resumeVersionId` set.
  - [ ] Web Store listing published; privacy disclosures match the
    actual data flow.

### R-034 · One-click tailor (JD → tailored version)

- Status: **BACKLOG**
- Depends-on: R-033, R-030
- Acceptance
  - [ ] Anywhere the user sees a JD (extension, `/jd-match`, `/jobs`),
    a single "Tailor" button creates a NEW `ResumeVersion` with the
    AI rewrites applied.
  - [ ] Diff view shows the deltas against the base version; user can
    accept / reject per-bullet.
  - [ ] Each tailored version is auto-labelled with the company + role.
  - [ ] Counts against the AI-token quota (already enforced).

### R-035 · Outcome insights at the moment of choice

- Status: **BACKLOG**
- Depends-on: R-031, R-034
- Acceptance
  - [ ] Template-picker and AI-rewrite acceptance UIs surface a small
    callout: "your v3 has a 4.1% reply rate vs. v1 at 2.6%" *based on
    the user's own data only* until aggregate data is meaningful.
  - [ ] After 1k anonymised applications in a (role, city) bucket, a
    separate callout shows the cohort median. Until then, only show
    own-data callouts — never fake confident numbers.

### R-036 · Navigation consolidation (12 → 5 hubs)

- Status: **BACKLOG**
- Depends-on: R-022
- Acceptance
  - [ ] Top nav shows: **Home · Resume · Applications · Coach · Account**.
  - [ ] Each hub has a single landing route that surfaces its tools as
    cards (Resume hub: Editor / Versions / Templates; Applications
    hub: Jobs / Outcomes / JD Match; Coach hub: Mentor / Mentor Chat /
    Interview Prep / Career Navigator / Sahaayak; Account: Billing /
    Settings).
  - [ ] All existing routes keep working (canonical URLs preserved for
    SEO and bookmarks).
  - [ ] A11y: skip-link still works, focus order tested on each hub.

### R-037 · Referral credit (1 free export per referred signup)

- Status: **BACKLOG**
- Depends-on: R-022
- Acceptance
  - [ ] Each user has a referral code (deterministic from userId hash).
  - [ ] Referred signup increments `referrerCreditedExports` for the
    referrer. The export-quota check honours the credit balance.
  - [ ] Anti-abuse: same email/IP can't credit twice, refund credits
    if the referred account is deleted in 30 days.

---

## §4. Days 30–60 — distribution + B2B pilot

Goal: agents and institutions can use Pocket Resume programmatically,
and every external call still feeds the Outcome Graph.

### R-040 · MCP server (`@pocketresume/mcp`)

- Status: **BACKLOG**
- Depends-on: R-033, R-034
- Acceptance
  - [ ] Stdio + HTTP transports.
  - [ ] Tools: `get_resume`, `list_versions`, `tailor_resume`,
    `log_application`, `get_outcome_stats`.
  - [ ] Per-user OAuth-style token; same quota system as the REST API.
  - [ ] `tailor_resume` writes a `ResumeVersion` so agent-driven
    tailoring still feeds the Outcome Graph.
  - [ ] Published to npm + listed in MCP server registry.

### R-041 · Public parsing + scoring API (B2B)

- Status: **BACKLOG**
- Depends-on: R-022
- Acceptance
  - [ ] `POST /v1/parse`, `POST /v1/score`, `POST /v1/tailor` endpoints
    behind API keys.
  - [ ] Metered billing per request; separate rate-limit tier from
    interactive users.
  - [ ] Per-tenant data isolation; uploads never join the personal
    `Resume` pool.
  - [ ] Each parse failure feeds the `pattern-learner` queue under a
    tenant-tagged `source` field.

### R-042 · Placement-cell B2B pilot

- Status: **BACKLOG**
- Depends-on: R-022, R-031
- Acceptance
  - [ ] 3 colleges signed (campus T&P officers).
  - [ ] Cohort onboarding flow: bulk invite emails; new tenant + role
    + cohort tag per institution.
  - [ ] Re-skinned admin dashboard scoped to the institution: ATS-readiness
    distribution, application funnel, response rate per student,
    intervention flags.
  - [ ] Pricing: ₹99/student/yr; uses the sachet rail.

### R-043 · WhatsApp notifications

- Status: **BACKLOG**
- Depends-on: R-031
- Acceptance
  - [ ] Meta Cloud API integration; user opts in once on Settings.
  - [ ] Outcome nudges (R-031) and Sahaayak weekly check-ins can route
    to WhatsApp instead of (or in addition to) email.
  - [ ] Templates pre-approved with Meta; no marketing content.

---

## §5. Days 60–90 — monetize the graph

### R-050 · In-product benchmark insights

- Status: **BACKLOG**
- Depends-on: R-031, R-035
- Acceptance
  - [ ] User dashboard shows their own response-rate vs. role/city
    median when sample size ≥ 100.
  - [ ] Insights cite sample size and time window. No bucket-of-one
    confident claims.

### R-051 · Public report — "State of the Indian Job Hunt"

- Status: **BACKLOG**
- Depends-on: R-050
- Acceptance
  - [ ] Quarterly publication based on anonymised aggregates.
  - [ ] Privacy review against DPDP: only stats computed over n≥1,000
    and aggregated to 2 significant figures.
  - [ ] One-page summary + downloadable methodology.

### R-052 · Local-first / Vault decision

- Status: **BLOCKED** (product decision)
- Depends-on: founder decision
- Options:
  - (a) Ship the vault flow end-to-end (key derivation in browser,
    encrypted resume blobs, settings toggle) — pairs with the honesty
    brand, takes ~3 sprints.
  - (b) Delete the scaffolding (`2ae743c`, `d010f58`) — removes the
    dead "almost-feature" and the future temptation to revive false
    marketing.
- Decision deadline: 30 days post-launch.

---

## §6. Cross-cutting constants

These are constraints that every requirement must respect. Violations
are bugs by definition.

### C-001 · Schema source of truth

`packages/resume-schemas/src/index.ts` is the only place the resume
data shape is defined. Any new field on resume / experience / etc.
ships there first, then `packages/resume-shared` re-exports, then
templates + editor consume. No data field exists in the editor that
isn't in the schema.

### C-002 · ATS section catalogue

`AtsSectionKey` in `resume-builder-shared/src/resume-normalization.ts`
is the canonical list of resume sections. Adding a new section:

1. Add the key to `AtsSectionKey` union.
2. Add a default title in `SECTION_TITLE_MAP`.
3. Add it to `ATS_SECTION_ORDER` at the correct position.
4. Update every template per `TEMPLATE_SPEC.md` §3 ("How a template
   adopts a new section without a rewrite").
5. Update the parser's `SECTION_SYNONYMS` so uploads recover the new
   section.

### C-003 · Privacy copy ↔ data flow

No customer-facing copy may claim privacy guarantees the code does not
deliver. R-001 acceptance criteria enforce this for shipped surfaces.
New surfaces use the same `PrivacyBadge` variants or copy reviewed
against the actual data path.

### C-004 · No silent quota bypass

Any export, AI call, or rate-limited resource must throw a typed
exception with a user-readable message naming the quota and the path
to remediation (upgrade or wait-for-reset). No env-flag escape
hatches; admin overrides are explicit and audited.

### C-005 · A11y baseline

Every interactive surface honours: skip-link target, focus trap on
modals, `role="status"` + `aria-live` on loading states,
`prefers-reduced-motion` on animations. `tests/` directory has the
pinning tests; CI must keep them green.

### C-006 · Honesty over polish

If a feature is half-built (vault, social login error map), the user
must NOT be told it works. Either ship it end-to-end or hide it
behind an admin flag. The kill list lives in §7 with dates.

### C-007 · Outcome attribution

Every code path that creates a `ResumeVersion` must let the caller
attribute applications to it. Every code path that creates a
`JobApplication` must accept a `resumeVersionId`. This is the moat;
do not break it.

---

## §7. Decisions log

| Date | Decision | Reason | Affected IDs |
|---|---|---|---|
| 2026-06-11 | Defer vault flow decision to post-launch | Time pressure + need real user signal | R-001, R-052 |
| 2026-06-11 | Keep PRODUCT_FLOW_RESTRICTIONS_ENABLED guard for FREE-block only; quota is unconditional | Founder reported a free user pulled 6 PDFs; flag-gated quota = decorative | R-003 |
| 2026-06-11 | Two upload buttons instead of one merged | Merged button forced ATS-mode race which wiped fields | R-007 |
| 2026-06-11 | Removed `KNOWN_HEADING_PHRASES` punctuation escape | Orphan soft-wrap words ("frameworks.") were being treated as headings; cost: Infosys lost 12 bullets | R-010 |
| 2026-06-11 | 12 → 5 nav hubs scheduled for days 0–30, not pre-launch | Risk of regressing routes is too high in launch week | R-036 |
| 2026-06-11 | Sahaayak NOT cut despite scope-creep appearance | Brand-defining differentiator in Indian market; nothing else acknowledges the emotional reality of job hunting | — |
| 2026-06-11 | Static `/mentor` ROLE_SEEDS deprecated → fold into Coach hub | Curated content goes stale next to live AI | R-036 |
| 2026-06-11 | sms-gateway + resume-builder-ai standalone services flagged for archive if untouched in 90 days | Two AI call paths is one too many | — |

---

## §8. How to update this file

In the same commit as the code change:

1. Find the requirement ID this work belongs to (`grep ^### docs/REQUIREMENTS.md`).
2. Update the `Status` line.
3. Append the new commit SHA to `Commits:`.
4. If acceptance changed, edit the bullets and re-run their tests.
5. If the work doesn't belong to any existing ID, append a new ID at
   the correct dependency position and write the acceptance criteria
   BEFORE writing the code.

A commit that touches code without updating this file when the change
maps to a tracked requirement is itself a bug. CI will not enforce
this; reviewers should.
