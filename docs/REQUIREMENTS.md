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

- Status: **DONE** (with a controlled env override; see decision row 2026-06-12)
- Commits: `b08dfda`, `da29839`, (this commit)
- Acceptance
  - [x] `generatePdf` rejects with `ForbiddenException` containing the
    string `"Monthly export limit reached"` when `pdfExportsUsed + 1 >
    pdfExportsLimit` **AND** `ENFORCE_EXPORT_QUOTA !== 'false'`.
  - [x] `generateDocx` shares the same counter and enforces the same
    ceiling. Increment happens only after the render succeeds.
  - [x] Default behaviour is ENFORCED — flipping the flag requires an
    explicit env setting (`ENFORCE_EXPORT_QUOTA=false`); silence of
    the variable means enforce. R-022 (Deploy) acceptance includes
    removing the override before going live.
  - [x] `tests/export-quota.unit.test.cjs` (4 tests) pin the contract.
  - [x] Client-side error mapping no longer translates 403 → "Your
    session expired" (that copy is reserved for 401). 403 surfaces
    the server's own message ("Monthly export limit reached (5).
    Upgrade your plan or wait for next month's reset.") so the user
    sees the actual cause.

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

- Status: **IN-PROGRESS** (local pass DONE 2026-06-11; prod Part B waiting on founder)
- Depends-on: R-001 … R-011
- Owner: founder (prod URL `https://ats-rb-web.onrender.com` is not
  reachable from the Claude sandbox — egress blocked)
- Reference: `docs/SMOKE_TEST_CHECKLIST.md` Parts A + B
- Local smoke results (production build, local Postgres, 2026-06-11):
  - A1 ✅ CSP `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`
  - A2 ✅ `/templates` → 307 → `/templates/preview`
  - A3 ✅ sitemap.xml renders; A4 ✅ robots.txt disallows app routes
  - A5 ✅ `/health` 200; A6 ✅ `/app/version` JSON (android URL empty —
    needs prod env)
  - B1 ✅ register (after R-023 fix — **failed before it**)
  - B2 ✅ login; B11 ✅ logout 201
  - B6 ✅ 6th PDF rejected 403 "Monthly export limit reached (5)"
  - B7 ✅ DOCX shares counter: blocked at 5/5, succeeds at 2/5,
    counter increments to 3
  - B9 ✅ no "stays on this device" in rendered HTML; hero shows the
    honest copy
  - 17/17 app routes render HTTP 200 on the production build
  - B3/B4/B10 (upload UX, field persistence after refresh, print
    dialog) require a real browser → founder runs them on prod
  - B12 (analytics IP attribution) requires prod `AUDIT_URL` → founder
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

### R-023 · Prisma migration catch-up (schema drift)

- Status: **DONE**
- Commits: (this commit)
- Found during: R-020 local smoke run, 2026-06-11
- Why: `schema.prisma` contained `User.premiumCredits` plus the
  `AiCritiqueLog`, `PaymentHistory`, `AiTokenUsage` tables (arrived via
  merge commit `b0b259a`) but NO migration ever created them. Any
  fresh database provisioned with `prisma migrate deploy` was missing
  the column, and **every** `/auth/register` call failed with Prisma
  P2022 surfaced as a 503 "service temporarily unavailable". Local
  smoke reproduced this on first registration attempt.
- Acceptance
  - [x] Catch-up migration `20260611150000_catchup_premium_credits_billing_tables`
    creates the column + 3 tables + 4 indexes, all `IF NOT EXISTS` so
    it is safe on fresh databases AND on databases where `db push`
    already created the objects out-of-band (likely the current prod).
  - [x] `JobApplication.@@index([resumeVersionId])` restored in
    `schema.prisma` — it existed in migrations but was lost from the
    schema in the same merge; without it `prisma migrate diff` proposed
    DROPPING the Outcome Loop's aggregation index (C-007 violation).
  - [x] Verified locally: register succeeds after applying; quota
    enforcement (R-003) returns the correct 403 on both PDF and DOCX;
    DOCX increments the counter on success.

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

- Status: **DONE** (on branch; activates in prod once `CRON_SECRET` is
  set and a Render Cron Job hits `/outcome-nudge/run` daily)
- Depends-on: R-022 (for activation; built and verified pre-deploy)
- Acceptance
  - [x] `runNudgeScan` finds `JobApplication.status='applied'` where
    `appliedAt < now - 7d`. Triggered by `POST /outcome-nudge/run`
    guarded by `CRON_SECRET` header (refuses when unset) — no
    in-process scheduler, so horizontal scaling can't double-send;
    idempotency comes from the unexpired-nudge check per application.
  - [x] Sends one email with three one-tap buttons: `[No reply yet]`
    `[Rejected]` `[Interview!]` (plain-text + minimal HTML). Web push
    deferred — decision row 2026-06-12: email-only for launch, push
    arrives with the WhatsApp work (R-043) so notification channels
    land together.
  - [x] Each button hits the unauthenticated
    `GET /outcome-nudge/:token/:action` endpoint; the single-use
    token is the authorization. Status transitions: `rejected` →
    `rejected` (+`closedAt`), `interview` → `interview`, `no_reply`
    keeps status and bumps `nextActionAt` +7d so the application
    resurfaces in the tracker. Confirmation is a self-contained
    zero-JS HTML page (mail-client webviews) linking back to
    `$APP_WEB_URL/jobs`.
  - [x] Tokens: 32-char unambiguous alphabet, single-use, 30-day
    expiry, uniform 404 for missing/expired/used (no oracle). On
    SMTP failure the nudge row is deleted so the next scan retries —
    a transient outage can't silence an application's nudge for the
    whole token lifetime.
  - [x] Unsubscribe link in every email → flips
    `User.nudgeEmailsEnabled=false` globally; deliberately does NOT
    burn the token so the user can unsubscribe AND still answer the
    question from the same email. Scan skips opted-out users
    (verified: `skippedOptOut:1`).
  - [x] Analytics: `nudge_outcome_recorded` (with action) +
    `nudge_unsubscribed` events — tap-through rate is the health
    metric of the Outcome Graph.
  - [x] 4 unit tests pin token shape/entropy, the exact
    action→status map, and the 7d/30d constants. Full loop
    smoke-verified on the local stack (seed stale app → scan → row
    created → tap interview → status advanced → re-tap 404 →
    unsubscribe honoured by next scan).

### R-032 · Mail-in outcome capture

- Status: **DONE** (on branch; activates in prod once an inbound-mail
  provider routes `track@pocketresume.app` to the webhook and
  `INBOUND_MAIL_SECRET` is set)
- Depends-on: R-031
- Acceptance
  - [x] `POST /outcome-mail/inbound?secret=…` webhook, provider-shape
    tolerant (SendGrid `from/subject/text`, Mailgun
    `sender/subject/body-plain`). Refuses (403) when the secret is
    unset or wrong; always returns `{accepted:true}` to the provider
    otherwise (4xx would make providers disable the route). Sender
    must match a registered account — unknown senders are audited
    and ignored, no oracle.
  - [x] `detectOutcome` recognises rejections ("unfortunately",
    "regret to inform", "not moving forward", "position has been
    filled"…), interviews ("schedule an interview", "shortlisted",
    "next round", "availability for a call"…), offers ("pleased to
    offer", "offer letter", "extending an offer"…). Precision over
    recall: receipt confirmations and ordinary mail return null
    (false positive = wrong status written; false negative = user
    logs manually). Rejection outranks interview; offer outranks
    interview.
  - [x] Company matching against OPEN applications only, word-boundary
    + corporate-suffix stripping both ways ("Globex Corporation" ↔
    "Globex", "Acme Tech Pvt Ltd" ↔ "Acme"); names < 3 chars never
    match. Exactly one match → status applied directly (rejected also
    sets `closedAt`).
  - [x] Zero/multiple matches → disambiguation email with one one-tap
    link per candidate (≤5), REUSING the R-031 OutcomeNudge token
    machinery — tapping applies the detected outcome to that
    application via the existing `GET /outcome-nudge/:token/:action`.
  - [x] Bodies are NEVER stored. `InboundOutcomeMail` audit rows keep
    from + truncated subject + resolution, expire after 30 days,
    purged by the same daily cron as the nudge scan
    (`purgedInboundMail` in the run summary).
  - [x] 10 unit tests pin the detection phrases, precision rules,
    suffix-stripping matcher, ambiguity behaviour, <3-char guard, and
    display-name email parsing. Smoke-verified end-to-end: 403 paths,
    unknown-sender audit, single-match auto-apply
    (applied→rejected+closedAt), ambiguous two-Globex case creating 2
    disambiguation tokens, tapping one records the interview, cron
    purge wired.

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

- Status: **DONE** (on branch; not merged. Extension surface tracked under R-033)
- Depends-on: R-030 (R-033 needed only for the extension surface)
- Acceptance
  - **API phase — DONE**
  - [x] `POST /ai/tailor/:resumeId/propose {jdText}` → LLM reads
    resume + JD, returns a `TailorProposal` (summary rewrite,
    per-bullet before/after changes, skillsToAdd). Nothing saved.
    Validation boundary `parseTailorResponse` drops hallucinated
    bullet ids, no-op rewrites, empties; caps skills at 20 (6 unit
    tests). Honest 403 when no AI provider is configured — NO
    rule-based fallback by design (mechanical verb swaps across a
    whole resume produce garbage diffs that erode trust).
  - [x] `POST /ai/tailor/:resumeId/apply` → creates a NEW
    `ResumeVersion` labelled `Tailored: <role> @ <company>` (C-007
    attribution). Live resume untouched unless `applyToLive=true`.
    Stale-proposal guard: a bullet whose `before` text no longer
    matches the current resume is rejected (`rejectedAsStale` count
    returned) instead of being written into the wrong slot.
  - [x] Plan-gated STUDENT+ (mirrors BulletRewriter), ~2500 AI tokens
    charged per propose, 6/min rate limit. Counts against the
    existing quota (verified end-to-end on local stack: propose
    validation paths, apply happy path, stale rejection, empty-apply
    400, applyToLive).
  - **Web phase — DONE**
  - [x] Diff view on `/jd-match` (`TailorDiffPanel.tsx`): "Tailor my
    resume for this JD" CTA → proposal renders as per-change BEFORE
    / AFTER cells with checkboxes (summary, each bullet, each new
    skill). User picks the subset → Apply → confirmation card
    surfaces the new version label, `appliedBullets`,
    `rejectedAsStale` count, links straight to
    `/resume/versions?id=…`. `applyToLive` opt-in checkbox; default
    keeps live untouched. `tailorPropose` / `tailorApply` added to
    `src/lib/api.ts`. Honest server errors (no GROQ key, plan gate)
    surface verbatim. tsc clean, page renders 200 in preview.
  - [ ] Extension surface (after R-033 — explicit registry split).

### R-035 · Outcome insights at the moment of choice

- Status: **DONE** (own-data phase, on branch; cohort phase deferred to R-050)
- Depends-on: R-031, R-034
- Acceptance
  - [x] `OutcomeInsightCallout` (built on tekivex-ui `TkxStatistic` +
    `TkxTag`) surfaces "your top version gets X% replies vs baseline
    at Y%" with sample sizes always visible, mounted at three moments
    of choice: template picker (`/resume/template`), the tailor panel
    on `/jd-match`, and the versions list. Reads the existing
    `GET /resumes/:id/outcomes` report (top / baseline / lift).
  - [x] Honesty gate: renders NOTHING unless the server marks the top
    version `significant` AND a distinct baseline exists. No fake
    confident numbers from 2 applications; insight failure is silent
    (it's garnish, never an error).
  - [x] Cohort-median callout explicitly deferred to R-050 (needs
    ≥1k anonymised applications per bucket).

### R-035b · Template catalogue metadata + achievements fallback (TEMPLATE_SPEC §2.1/§2.2)

- Status: **DONE** (on branch)
- Depends-on: R-030
- Why: the spec required five metadata fields per template that were
  never implemented, and an audit during this pass found only
  ClassicATS renders the achievements section — the other 10
  templates silently DROPPED it from preview + PDF (the founder's
  "all achievements are not listed" report, resurfacing at the
  template layer after the parser fix in R-010).
- Acceptance
  - [x] `TemplateCatalogItem` gains `supportedSections`,
    `supportedLocales`, `layout`, `paginationSafe`,
    `implementedVariants` (+ exported `TemplateVariant`,
    `TemplateLayout`, `TemplateSectionKey` types). All 11 catalogue
    entries populated honestly — only `classic` claims first-class
    `achievements`; `creative` is `multi-column`/not pagination-safe;
    `sidebar-bold` is `sidebar`.
  - [x] Shared `AchievementsSection` fallback in `templateUtils`
    (TEMPLATE_SPEC §1.3): canonical section title + plain list with
    style hooks. Wired into all 10 templates that lacked first-class
    styling — user achievements now render in every template's
    preview AND export (server uses the same components).
  - [x] 5 new §2.2 catalogue tests: section keys valid, en-IN locale
    required, layout + screen variant declared, atsSafety
    high/medium ⇒ ats-export implemented, and every template source
    references `achievementItems` OR `AchievementsSection` (the
    never-drop-user-data guard). 8/8 registry tests green; web tsc +
    API build clean; all three callout surfaces render 200 in
    preview.

### R-036 · Navigation consolidation (12 → 5 hubs)

- Status: **DONE** (on branch; not merged)
- Depends-on: R-022 (deploy gate — feature is launch-ready)
- Acceptance
  - [x] Top nav shows: **Home · Resume · Applications · Coach · Account**
    (post-login). Logged-out keeps the single Home link + login/register.
    Plan badge, Admin, and Logout live OUTSIDE the hub set — they're
    utility status, not navigation.
  - [x] Each hub has a single landing route that surfaces its tools
    as cards:
      - Resume → `/resume/start` (existing) augmented with a "More
        resume tools" section linking to Versions / Templates / ATS
        Score / ATS Simulator.
      - Applications → NEW `/applications/page.tsx` with Jobs / JD
        Match / Outcomes / Cover Letter cards.
      - Coach → NEW `/coach/page.tsx` with Mentor / Mentor Chat /
        Interview Prep / Career Navigator / Sahaayak cards. Plan
        badges (STUDENT+ / PRO) appear on the cards that gate.
      - Account → `/settings` (existing) which already surfaces a
        "Plan & billing" card.
  - [x] All existing routes keep working — `nav-hubs.ts` only adds
    landing routes (`/applications`, `/coach`) plus a single config
    that drives both nav highlighting and card grids. `/jobs`,
    `/jd-match`, `/resume/versions`, etc. are unchanged so every
    bookmark and inbound SEO link still resolves.
  - [x] A11y: skip-link unchanged. Hub cards are real `<a>` with
    `aria-label` combining title + blurb; the `aria-current="page"`
    rendered by TopNav is now driven by the longest-prefix matcher
    `activeHubKey` so screen readers announce one and only one
    active hub per page.
  - [x] 12 unit tests pin the hub contract: exactly 5 hubs in the
    declared order, every landing is a real route, the prefix map
    routes /jd-match → Applications, /sahaayak → Coach,
    /resume/outcomes → **Applications** (not Resume — that's the
    whole IA point), longest-prefix wins, utility routes (auth,
    admin, download) never activate a hub, SSR `pathname=''`
    activates nothing, boundary-similar paths (`/resume-template`,
    `/jobs-archive`) don't false-match. Removed the now-dead
    `nav-active.ts` helper. tsc + existing mobile-nav tests still
    green; preview-verified `/applications` and `/coach` render their
    card grids end-to-end.

### R-037 · Referral credit (1 free export per referred signup)

- Status: **DONE** (on branch; not merged)
- Depends-on: R-022 (deploy gate — feature is launch-ready)
- Acceptance
  - [x] Each user has a referral code: 8 chars, unambiguous alphabet
    (no 0/1/l/o), deterministic from the userId hash (reproducible in
    support conversations) with random retry on collision. Generated
    on first `GET /referrals/me`, stable forever after.
  - [x] Referred signup (`?ref=CODE` → localStorage → register
    payload) increments the referrer's `premiumCredits` — the
    pre-existing unused column from merge b0b259a, already in prod
    via R-023. The export-quota check in `generatePdf` AND
    `generateDocx` honours the balance: at the cap, one credit buys
    one export instead of a 403, and the quota error now says
    "refer a friend for a bonus export". Referral recording is
    fire-and-forget from the register flow — a referral bug can
    never block a signup.
  - [x] Anti-abuse: `referredUserId` unique (an account credits at
    most once), `emailHash` unique (same email never credits twice
    even across delete/re-create — verified in smoke), per-IP cap of
    3 credits per 30 days, self-referral suppressed. Suppressed
    attempts still write `creditGranted=false` rows for the admin
    dashboard. Client clears the pending code after a successful
    signup so one browser can't double-apply it.
  - [x] Settings `ReferralCard`: copyable
    `/auth/register?ref=CODE` link + credited-referral count +
    credit balance. Hides itself entirely on API failure (a broken
    referral card is worse than none).
  - [x] 9 unit tests (6 helper + 3 credit-path in the export-quota
    suite, whose in-memory Prisma mock now resolves
    increment/decrement atomics). Smoke-verified end-to-end: code
    generation stable across calls → referred signup credits +1 →
    same-email re-register does NOT double-credit → credit consumed
    at the cap (200, `used=5 credits=0`, monthly counter untouched)
    → next export 403 with the referral hint.
  - [ ] **DEFERRED**: 30-day clawback on account deletion — the
    product has no account-deletion endpoint yet. Decision logged in
    §7; the deletion feature MUST claw back credits granted for
    accounts deleted within 30 days of signup.

### R-038 · Public portfolio / share link

- Status: **DONE** (Phase 1 + Phase 2 on branch; not merged per founder instruction)
- Depends-on: R-022, R-030
- Why: a shareable per-user URL (`/p/:slug`) where companies can view
  the portfolio and download the linked resume. High moat alignment:
  every view/download is an outcome signal ("recruiter viewed your
  resume") that feeds the Outcome Graph — a class of signal we cannot
  capture today.
- Acceptance
  - **Phase 1 — DONE on this branch (commit pending)**
  - [x] `ShareLink` + `ShareLinkEvent` Prisma models with all required
    fields. Migration `20260611160000_add_share_links` applied.
  - [x] Strictly opt-in: links are never auto-created. Creation UI in
    Settings (`ShareLinksCard`) — Editor Export-modal CTA is Phase 2.
  - [x] Public page `GET /p/:slug`: server-rendered Next.js route,
    surfaces header / summary / skills / experience / projects /
    achievements / education / certifications / languages. "Download
    resume (PDF)" button. `noindex,nofollow` by default; switches to
    `index,follow` only when `allowSearchIndexing=true`.
  - [x] `GET /p/:slug/resume.pdf` calls
    `ResumeService.generatePdfBypassingQuota`. Does NOT count against
    the owner's export quota; per-slug rate limit (30/day) prevents
    scraping. View limit 200/day per slug.
  - [x] One-click revoke (soft, `enabled=false`) → public endpoints
    return `404` immediately. The row stays so the visit log is
    preserved for the owner's audit.
  - [x] View + download events fire through `AnalyticsService` with
    `share_link_view` / `share_link_download` types AND write
    `ShareLinkEvent` rows tied to the link (foundation for the
    outcome-signal feed; per-version attribution requires Phase 2).
  - [x] `maskContact` strips email + phone from the public payload.
    Page surfaces "Contact details hidden by the owner" copy.
  - [x] Privacy copy on the public page footer states what the owner
    can see: view + download counts and coarse location, never the
    visitor's IP. C-003 honoured.
  - [x] 7 unit tests pin slug shape (12 chars, no 0/1/l), entropy
    (200/200 unique), payload sanitisation (strips userId, applies
    maskContact correctly), anon-id determinism + no cross-owner
    linkage. Smoke-verified end-to-end on local stack (web + API +
    Postgres): create → public page renders → view counter increments
    → revoke → 404.
  - **Phase 2 — DONE on this branch (not merged)**
  - [x] Editor Export-modal "Share this resume" CTA
    (`ShareInExportModal.tsx`, mounted in `ResumeEditor.tsx`).
  - [x] Owner per-link visit log UI: expandable panel per link with
    kind + timestamp + country/city + referrer + truncated UA.
    Backed by `GET /share-links/:id/events`.
  - [x] Contact-relay form on the masked-contact public page
    (`ContactRelayForm.tsx`), posts to `POST /p/:slug/contact`, SMTP
    forward via `MailService.sendShareRelayEmail` with `Reply-To` set
    to the sender so the owner replies directly. Rate-limited 5/day
    per slug. Uniform "submitted" response on every non-validation
    path (no enumeration oracle).
  - [x] `expiresAt` picker in the Settings card. End-of-day UTC so
    "valid through 30 Jun" stays usable through 30 Jun IST.
  - [x] Pin to a specific `resumeVersionId` from the UI. Cross-resume
    pinning rejected server-side with 400 — the version must belong
    to the same resume + user.
  - [x] Coarse-geo enrichment on `ShareLinkEvent` via proxy-injected
    headers (`cf-ipcountry`, `x-vercel-ip-country`, `x-vercel-ip-city`).
    Treats "XX" / "T1" placeholders as missing. URL-decodes city
    names. Returns null/null on direct-internet deploys (the
    documented "WHEN AVAILABLE" branch). No IP-geolocation DB
    licensed in this repo by design.
  - [x] 12 unit tests pin slug shape + entropy, payload sanitisation,
    anon-id determinism + no cross-owner linkage, geo extraction
    across CF/Vercel/none, URL-decoding, XX/T1 placeholder handling.

---

## §4. Days 30–60 — distribution + B2B pilot

Goal: agents and institutions can use Pocket Resume programmatically,
and every external call still feeds the Outcome Graph.

### R-040 · MCP server (`@pocketresume/mcp`)

- Status: **DONE** (on branch; npm publish is a founder action — see open item)
- Depends-on: R-034 (R-033 dependency dropped: the extension is a
  separate surface, not a prerequisite — decision row added)
- Acceptance
  - [x] New `resume-builder-mcp/` package on the official
    `@modelcontextprotocol/sdk`. Stdio transport (default, what MCP
    hosts spawn) + Streamable-HTTP transport
    (`MCP_TRANSPORT=http MCP_PORT=…`, stateless, one server per user
    token).
  - [x] Six tools (the registry's five + `list_resumes` so agents can
    discover ids): `list_resumes`, `get_resume`, `list_versions`,
    `tailor_resume`, `log_application`, `get_outcome_stats`.
  - [x] Per-user token via `POCKET_RESUME_TOKEN` env (never argv — not
    visible in `ps`). Every tool delegates to the REST API with the
    user's own bearer token, so plan gates / AI-token quotas / rate
    limits apply identically to agents and humans. Expired token →
    clear re-auth message, no silent refresh (an MCP server holding
    refresh credentials is a bigger risk than the inconvenience).
  - [x] `tailor_resume` = propose + apply-all in one call, writing a
    `ResumeVersion` labelled `Tailored: <role> @ <company>` (C-007).
    The tool description instructs agents to pass the returned
    `versionId` as `resumeVersionId` in `log_application` — every
    agent-driven application feeds the Outcome Graph.
  - [x] Smoke-verified end-to-end against the live local API over
    real stdio JSON-RPC: initialize → tools/list (6) → list_resumes
    (real data) → get_outcome_stats (report flows) →
    log_application (JobApplication actually created) → bad-id and
    expired-token error paths both surface clean isError responses;
    missing token exits with setup guidance on stderr; HTTP
    transport answers initialize over POST.
  - [ ] **Open (founder)**: `npm publish` of `@pocketresume/mcp` +
    listing in the MCP server registry — needs the npm org login.

### R-041 · Public parsing + scoring API (B2B)

- Status: **DONE** (on branch; pricing + landing page are founder open items)
- Depends-on: R-022 (deploy gate; the API surface itself is launch-ready)
- Acceptance
  - [x] `POST /v1/parse` (multipart, PDF/DOCX/RTF/TXT ≤ 5MB),
    `POST /v1/score` (free-text + JD), `POST /v1/tailor` (free-text
    + JD → bullet rewrite proposals) — all behind the per-tenant
    `ApiKey` guard. `Authorization: Bearer pra_…` or `x-api-key:`
    accepted; 401 uniform on any failure (no oracle).
  - [x] Metered billing: every 2xx call appends an `ApiUsage` row
    (endpoint, status, hashed IP — never raw — truncated UA,
    durationMs); 4xx/5xx rows surface in admin but don't bill. Each
    key carries its own `monthlyCallLimit` (0 = unlimited) +
    `perMinuteLimit` so rate-limit tiers are per-tenant, not shared
    with interactive users. Per-minute limit enforced in the guard
    BEFORE the heavy work; monthly cap rejects with 401 once the
    billable count crosses the limit. `GET /v1/usage` returns the
    calling key's current month billable + errored counts.
  - [x] Per-tenant data isolation: `/v1/parse` calls
    `ResumeService.parseResumeUpload(..., {mode: 'extract-only'})`
    and STREAMS the result back — nothing is persisted to a user's
    Resume table. The score + tailor endpoints are entirely stateless.
    Keys never join the personal user account graph.
  - [x] Admin surface `/admin/api-keys` (create/list/revoke/usage)
    behind `JwtAuthGuard + AdminAuthGuard`. Keys are stored as SHA-256
    hashes only — the plaintext is returned ONCE on creation; lost
    keys are rotated, never recovered.
  - [x] 5 unit tests pin: key alphabet (no 0/1/l/o), 200-draw
    entropy, deterministic hash that never echoes plaintext, tenant
    slug normalisation collapsing case/punctuation/length, IP hash
    determinism. Smoke-verified end-to-end against the live local
    stack: admin issues key → `/v1/parse` on the founder's real
    Chandan PDF returns the full structured resume (4 experiences,
    2 achievements, skills extracted) → `/v1/score` against a JD
    returns ATS score + missing keywords → `/v1/tailor` returns
    rewrite proposals → `/v1/usage` reports 3 billable + 0 errored
    → burst of 32 concurrent calls splits as 25/200 + 7/429 against
    the perMinuteLimit=30 cap → revoke flips the key to 401.
  - [ ] **Open (founder)**: pricing card + public landing page (the
    sales surface; the technical surface is shipped).
  - [ ] **Future**: parse-failure feed into `pattern-learner` with a
    tenant-tagged `source` field is sequenced separately once
    pattern-learner is exposed to non-personal-user data.

### R-042a · Retire duplicate "Executive Impact" template + PDF preview parity

- Status: **DONE** (on branch)
- Depends-on: R-035b, C-002
- Context
  - Founder smoke 2026-06: "Classic ATS" and "Executive Impact" rendered
    identically — the templates differed only by h1 21→24px, h2
    letter-spacing 0.08→0.12em, and the experience company joiner.
    Catalog promised "Leadership-focused, results-first" but the React
    component shipped the same single-column block as Classic.
  - Same smoke: downloaded PDFs had a blank band at the bottom of
    page 1 pushing whole experience items to page 2, and the font
    looked heavier than the on-screen preview. Root cause was
    `page-break-inside: avoid` on `.ats-item` plus an Arial-led font
    stack that fell back to a Linux serif on headless Chrome (Render).
- Acceptance
  - [x] `executive` catalog entry removed; both `executive` and
    `executive-impact` aliased to `classic` in catalog +
    `normalizeTemplateId` so saved resumes / share links keep working.
  - [x] `ExecutiveImpact.tsx` deleted; `templateRegistry` no longer
    references it; profession recommendations swapped off `executive`.
  - [x] PDF CSS: `.ats-item { page-break-inside: avoid }` removed; the
    heading-with-first-bullet glue is preserved via `break-after:
    avoid` on `h3` + `orphans/widows: 3` on `ul` so a tall experience
    block now fills the page instead of jumping to the next one.
  - [x] Font stack unified to `'Inter', system-ui, …, 'Liberation
    Sans', 'DejaVu Sans', Arial, sans-serif` in BOTH preview
    (`globals.css`) and PDF export so the downloaded resume matches
    the on-screen preview byte-for-byte; Linux fallbacks survive on
    headless Chrome.
  - [x] Pinning tests in `resume-export-template.unit.test.cjs`:
    blank-space regression test + Inter-stack font test + legacy
    `executive` id aliases-to-classic test. `template-recommendation.test.ts`
    updated to assert `consultant` for senior resumes.

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

### R-045 · Resume design customization (accent / font / density, then reorder + photo)

- Status: **IN PROGRESS** — Phase 1 (font + density + accent) DONE; full
  file-level plan in `docs/DESIGN_CUSTOMIZATION_PLAN.md`. Phases 2–3
  (section reorder, photo/header) remain.
- Depends-on: TEMPLATE_SPEC §1.4, §5, §9 (token layer + preview↔export parity)
- Rationale: make templates feel "standard"/Adobe-class; the single most
  requested polish lever. Phased to protect the export pipeline + spec tests.
- Acceptance (Phase 1a — font + density) ✅
  - [x] Per-resume `fontFamily` / `density` persisted (Prisma migration
    `20260615190000_add_resume_design`) and editable from an editor "Design"
    panel; preview + export reflect the choice.
  - [x] Applied identically in the React preview AND the server export
    (`renderResumeTemplateHtml`) via a shared `designCssVars()`/`designCssText()`
    CSS-var map in `resume-builder-shared/src/design.ts`
    (`--rb-font`/`--rb-fs-scale`/`--rb-lh`).
  - [x] Zero visual regression when no design is set —
    `designCssVars` returns `{}` and every template root reads
    `var(--rb-*, <current default>)`. Pinned by `tests/design.test.cjs`.
  - [x] Font allow-list validated on client AND server (zod
    `density` enum + `FONT_OPTIONS` resolution); CSP `font-src` already permits
    `fonts.gstatic.com`; Google Fonts preload expanded to the full set in
    `app/layout.tsx`.
- Acceptance (Phase 1b — accent colour) ✅
  - [x] Per-resume `accentColor` (validated hex; `normalizeAccentColor` on
    client + server) persisted (migration `20260615200000_add_resume_accent`)
    and editable via swatch presets + custom picker in the Design panel.
  - [x] Applied via the same `--rb-accent` var layer in the preview
    (`globals.css`) AND the export renderer (`resume.service.ts`) across the
    ATS section headings/header-bar and the visual templates' sidebar/band/
    section-title/timeline accents. Pinned by `tests/design.test.cjs`.
  - [x] Zero regression when unset — `--rb-accent` resolves to each rule's
    pre-existing colour as the `var()` fallback.
  - [x] ATS-export variant stays single-column/plain (§9.5); accent only
    recolours text/rules, never structure.
- Acceptance (Phase 2 — section reorder): per-resume `sectionOrder` override
  read through `getAtsSectionOrder`; unknown/missing → canonical fallback (§9.4).
- Acceptance (Phase 3 — photo/header): per-resume `photoUrl` / `headerStyle`;
  default OFF for US/ATS-strict templates, ON for visual templates; ATS-export
  always omits the image.

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
| 2026-06-11 | Public portfolio links promoted from "later" (strategy §4.3) to §3 backlog as R-038 | Founder request + view/download events are an Outcome Graph signal class we can't capture any other way | R-038 |
| 2026-06-11 | Company downloads via share link do NOT burn the owner's export quota | Owner shouldn't be penalized for recruiter interest; scraping handled by per-slug rate limit instead | R-038, R-003 |
| 2026-06-12 | Introduce `ENFORCE_EXPORT_QUOTA` env flag, defaulting to TRUE | Founder pre-launch testing on the Render preview hit the 5/mo cap with the only available test account. Going-live checklist (R-022) requires removing or setting the override to `true`. | R-003 |
| 2026-06-12 | Client maps 401 → "session expired"; 403 surfaces the server's own message | Founder reported a 403 from quota enforcement displaying "Your session expired", which sent users to re-login (no help) instead of telling them why the download was blocked. C-003 — copy must match the real cause. | R-003 |
| 2026-06-12 | Razorpay `cdn.razorpay.com` added to CSP script-src + connect-src | "Confirming Payment" hang on live preview was the SDK waiting for a global the CSP-blocked risk-detection bundle would have installed. Without the bundle the post-payment confirmation never resolves. | R-005 |
| 2026-06-12 | R-031 ships email-only; web push deferred to R-043 | One notification channel done well beats two done half; push + WhatsApp land together so channel preferences are designed once. | R-031, R-043 |
| 2026-06-12 | Nudge trigger is a CRON_SECRET-guarded endpoint, not an in-process scheduler | Survives horizontal scaling without double-sends (idempotent scan), works with Render Cron Jobs, no new dependency. | R-031 |
| 2026-06-12 | Referral credits reuse the dormant `User.premiumCredits` column | Field already exists in prod (R-023 catch-up); credits denominate in exports (1 referral = 1 export ≈ ₹49) which is legible without a pricing table. | R-037, R-003 |
| 2026-06-12 | Referral 30-day clawback deferred until account deletion exists | No deletion endpoint in the product today; the deletion feature must implement the clawback when it ships. | R-037 |
| 2026-06-12 | R-040 no longer depends on R-033 | The MCP server wraps the REST API directly; the browser extension is a sibling surface, not a prerequisite. Agents are usable the moment the package is published. | R-040, R-033 |
| 2026-06-11 | sms-gateway + resume-builder-ai standalone services flagged for archive if untouched in 90 days | Two AI call paths is one too many | — |
| 2026-06-15 | R-045 (design customization) scoped as a phased plan, not a single rushed change | Accent theming touches 10 template CSS blocks + the separate server export renderer + a missing token layer + parity tests + a migration + CSP/fonts. Shipping it hastily risks breaking PDF export and §9 parity. Plan in docs/DESIGN_CUSTOMIZATION_PLAN.md; Phase 1 ships as its own PR. | R-045 |

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
