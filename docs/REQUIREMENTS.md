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

- Status: **BACKLOG** (publishing runbook + listing draft now in
  `resume-builder-extension/STORE_LISTING.md`; the auth handshake below
  is the one code blocker)
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

- Status: **PARTIAL** (R-087 batch) — channel + wiring shipped env-gated;
  per-user Settings opt-in NOT yet built, so do NOT set the template env
  vars in prod until the opt-in toggle exists (Meta policy requires user
  consent for business-initiated messages).
- Depends-on: R-031
- Acceptance
  - [ ] User opts in once on Settings. **(pending — the launch blocker
    for enabling this channel)**
  - [x] Meta Cloud API integration: `notifications/whatsapp.service.ts`
    (template sends, phone normalization, never-throws, token never
    logged/scrubbed), `GET /admin/whatsapp/status` diagnostics.
  - [x] Outcome nudges (R-031) and job-alert digests route to WhatsApp
    in ADDITION to email, fire-and-forget, gated on
    `WHATSAPP_NUDGE_TEMPLATE` / `WHATSAPP_ALERT_TEMPLATE` +
    `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`. Unset = off.
    Pinned by `tests/whatsapp.unit.test.cjs` (13).
  - [ ] Templates pre-approved with Meta; no marketing content. (founder
    ops step — see the launch key runbook)

---

### R-045 · Resume design customization (accent / font / density, then reorder + photo)

- Status: **DONE** — Phase 1 (font + density + accent), Phase 2 (section
  reorder, ATS family), and Phase 3 (profile photo, visual templates) all
  shipped. Full file-level plan in `docs/DESIGN_CUSTOMIZATION_PLAN.md`.
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
- Acceptance (Phase 2 — section reorder, ATS family) ✅
  - [x] Per-resume `sectionOrder` override (migration
    `20260615210000_add_resume_section_order`; empty array = default) editable
    via up/down controls in the Design panel (shown for the 7 single-column
    ATS templates; the name/contact header is fixed on top).
  - [x] Resolved through a shared `resolveSectionOrder` helper consumed by BOTH
    the React preview (new `OrderedAtsSections` renderer that the 7 ATS
    templates now share) and the export `renderOrderedSections`, so preview ↔
    export stay in lock-step. `getAtsSectionOrder` honours the override.
  - [x] Unknown/missing keys fall back to the template's canonical order
    (§9.4). Pinned by `tests/section-order.test.cjs` +
    `tests/resume-export-template.unit.test.cjs`.
  - [x] Visual templates (sidebar/accent/creative) keep fixed layouts (scope:
    "ATS family only").
  - Note: unifying the 7 ATS templates onto one renderer also fixed pre-existing
    preview↔export drift (languages section modifier class; achievements
    position in academic/healthcare) — export ordering is now authoritative.
- Acceptance (Phase 3 — profile photo) ✅
  - [x] Per-resume `photoUrl` stored as a size-capped base64 `data:` URI
    (migration `20260615220000_add_resume_photo`; no object storage in this
    stack — CSP already permits `data:` for img-src). Validated on client AND
    server via `normalizePhotoUrl` (png/jpeg/webp only, ≤ ~1.1 MB; remote URLs
    / svg / oversize rejected). Uploads are downscaled client-side to ≤512px.
  - [x] Rendered ONLY by the visual templates (`sidebar-bold`, `accent-header`)
    in both preview and export, gated by `templateSupportsPhoto`. The editor
    photo control only appears for those templates.
  - [x] ATS templates and every ATS-safe export NEVER include the image, even
    if a photo is stored (§9.5). Pinned by `tests/resume-export-template.unit.test.cjs`
    + `tests/design.test.cjs`.
  - Note: `headerStyle` from the original plan was descoped — the photo alone
    delivers the region-aware (India vs US/ATS) differentiation; a separate
    header-style axis added complexity without a clear user ask. DOCX export
    stays text-only (ATS-oriented), so it omits the photo by design.

---

## §5. Days 60–90 — monetize the graph

### R-050 · In-product benchmark insights

- Status: **DONE — Phase 1** (R-087 batch). Platform-wide median only;
  role/city segmentation deferred to Phase 2 (needs volume).
- Depends-on: R-031, R-035
- Acceptance
  - [x] `GET /jobs/benchmark`: caller's response rate vs. the MEDIAN of
    per-user response rates, computed only over users with ≥5 applied
    applications; locked (`available:false` + honest reason) until ≥10
    qualifying users. Never exposes another user's data. Surfaced as the
    "How you compare" card on `/resume/outcomes` with encouraging copy
    both sides of the median. Pinned by
    `tests/outcomes-benchmark.unit.test.cjs`.
  - [x] Insights cite cohort size; no bucket-of-one confident claims
    (the ≥10-user gate).
  - [ ] Phase 2: role/city medians once cohorts clear the same gates.

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

### R-071 · Resume-AI: BYOK-free or flat per-download AI fee

- Status: **IN PROGRESS** (commit pending)
- Depends-on: R-003 (download charge), R-005 (BYOK pivot)
- Context: subscriptions are gone. Resume-upgrade AI (AI critique,
  bullet rewrite, JD-match/tailor) is free with the user's own key
  (BYOK). If the user has no key, OUR AI runs and a flat fee is added
  to that resume's next ₹49 download. Non-resume AI stays BYOK-only
  until the single ₹499/mo plan ships (separate commit).
- Acceptance
  - [x] `Resume.aiAssistUsed` flag (schema + migration) set server-side
    when OUR AI assists a resume (critique, bullet rewrite, tailor);
    BYOK never sets it.
  - [x] `DownloadChargeService` adds a flat AI fee (`DOWNLOAD_AI_FEE_*`,
    default ₹20 / $0.50) when `aiAssistUsed` and the user is not on a
    paid plan; fee math is the pure, tested `aiFeeApplies()`.
  - [x] Flag cleared on successful paid verify (Razorpay + Stripe).
  - [x] Upgrade-to-Student/Pro prompts on ATS critique + JD-match
    replaced with "add your own AI key (free)" messaging.
  - [x] Pinning test `tests/download-ai-fee.unit.test.cjs`.
  - [x] Single ₹499/mo plan ("Pocket Resume Plus") — the ONLY
    subscription, reuses internal `PRO` value. Razorpay
    `PRO_MONTHLY` = 49900 paise; billing page wires create-order +
    verify.
  - [x] Non-resume AI (Mentor, Interview-Prep, Recruiter-sim,
    Skill-demand, Cover-letter): BYOK free, OR ₹499 plan unlocks OUR
    AI; otherwise rule-based baseline + upsell — app key never spent
    for a free, key-less, plan-less user. Shared gate in
    `src/ai/server-provider.ts`; test
    `tests/non-resume-ai-gate.unit.test.cjs`.
  - [x] Marketing/paywall copy across web replaced (no Student/Pro,
    no ₹199/₹399/₹799).
  - [x] Refined model (dev-testing): the ONLY two AI features a free,
    key-less, non-subscriber user may run are **AI Critique** and
    **Tech Gap** (both on the editor page); these run OUR AI and flag
    `aiAssistUsed` so the next download carries the AI fee. ALL other
    AI (bullet rewrite, JD-match, tailor, and every non-resume
    feature) is BYOK-or-₹499-plan only, otherwise rule-based / blocked
    — no app-key spend.
  - [x] ₹499 plan users download FREE: `createOrder` returns
    `{ included, downloadToken }` for any non-FREE plan (no Razorpay
    checkout).
  - [x] BYOK users: all AI unlocked on their own key, still pay ₹49
    per download (no AI fee).
  - [x] Download AI fee disclosed in `DownloadChargeModal`.
  - [x] Explicit opt-in: a free, key-less, non-subscriber user who clicks
    AI Critique / Tech Gap is shown a dialog ("Use AI — adds ₹20 at
    download" / "Add my AI key (free)" / "Cancel"). OUR AI runs and flags
    the fee ONLY on opt-in (`aiOptIn` flag through `ai-critique` +
    `tech-gap`); without it they get the rule-based result, no charge.
    BYOK / plan users skip the dialog.
  - Note: "everyone pays to download" requires `ENABLE_DOWNLOAD_CHARGE=true`
    (+ Razorpay keys) in the environment; the code hard-blocks the
    PDF/DOCX routes via the download token when the flag is on.

---

### R-072 · Editor bullet-length remediation (rewrite / shorten / split)

- Status: **DONE** (this commit)
- Depends-on: R-006 (editor), R-071 (bullet-rewrite gating)
- Context: the editor flags any experience bullet over
  `BULLET_MAX_WORDS = 28` with "This bullet exceeds 28 words. Shorten
  it for better ATS readability." A free / key-less / plan-less user
  gets the rule-based rewriter, which must produce genuinely shorter
  AND readable alternatives — not verb-swaps that stay the same length,
  and not garbage that echoes extraction artifacts. Earlier passes
  (901beaa) made it length-aware but still leaked a role-title clause
  ("Led an Assistant Vice President, …"), kept dangling truncated
  fragments ("…the solution was recognized by"), and failed to tighten
  a long SINGLE-sentence bullet at all (no comma to split on).
- Acceptance
  - [x] `ruleBasedRewrites` / `shortenBullet` / `splitLongBullet` share
    one clause engine (`buildBulletCandidates`) that: splits on
    commas/semicolons AND subordinate/participial connectors
    (while/which/including/…) so a long single-sentence bullet still
    tightens; drops leaked job-title clauses (`isRoleLeakClause`);
    drops dangling truncated fragments ending on a preposition/article
    (`isDanglingFragment`); drops filler (`FILLER_RE`); greedily packs
    surviving clauses into tidy ≤28-word bullets; ranks impact-first
    (action-verb + metric).
  - [x] Every rewrite of an over-limit bullet is ≤28 words and ≥3
    words; accepting one clears the "too long" flag.
  - [x] An in-range bullet carrying droppable junk (dangling fragment /
    role leak / near-limit filler) is still cleaned; a genuinely clean
    in-range bullet keeps the legacy verb-swap behavior (no mangling).
  - [x] Web mirror `src/lib/bullet-utils.ts`
    (`splitBulletIntoBullets` / `shortenBulletText` / `canSplitBullet`)
    matches the API engine so free users get offline "Split into N
    bullets" and "Shorten to one bullet" actions in the rewrite panel.
  - [x] Pinning tests: `tests/bullet-rewriter-shorten.unit.test.cjs`
    (API, incl. the two real screenshot bullets + no-role-leak +
    no-dangling + metric-first + no-false-positive) and
    `tests/bullet-utils.test.ts` (web).

---

### R-073 · Paid-but-couldn't-download recovery (email-only)

- Status: **DONE** (this commit)
- Depends-on: R-003 (download charge), R-071 (per-download AI fee)
- Context: a user can pay the ₹49/₹0.99 download charge and still not
  get the file — tab closed, network drop, 15-min token expiry, or a
  failed PDF render. Before this, the paid entitlement was a one-shot
  JWT with no server record linking payment→resume→email, so support
  could not look a payment up or resend the resume, and the user could
  even be charged twice. Support is **email-only** (no phone).
- Acceptance
  - [x] `PaymentHistory` gains `resumeId`, `email`, `fulfilledAt`
    (schema + migration `20260708120000_...`); DOWNLOAD orders persist
    the resume + buyer email at creation.
  - [x] Idempotency + free re-download: `DownloadChargeService.createOrder`
    returns `{ included, alreadyPaid, downloadToken }` without charging
    when a captured DOWNLOAD for that resume already exists
    (`hasPaidEntitlement`). Prevents double-charge.
  - [x] `assertDownloadAllowed` gates PDF/DOCX on a valid token OR a paid
    entitlement, so an expired/lost token still lets the buyer
    re-download; unpaid users are still blocked. Self-serve
    `POST billing/download-charge/reissue` returns a fresh token for an
    already-paid resume (`reissuePaidToken`, 403 otherwise).
  - [x] Every export emails + logs a copy: `deliverResumeCopy` sends the
    PDF **and** DOCX (previously PDF only), records a `ResumeEmailLog`
    row (`sent | failed | skipped`) so "a copy has been emailed to you"
    is verifiable (C-003), and stamps `fulfilledAt`.
  - [x] Admin/support console (`AdminAuthGuard`): `GET admin/support/payments`
    looks up a payment by email / resumeId / order id (with resume title,
    delivery status, and a `needsResend` flag for captured-but-unfulfilled),
    and `POST admin/support/resend` re-renders the resume (no quota charge,
    `generatePdfBypassingQuota` / `generateDocxBypassingQuota`) and emails
    it to the buyer, logging the `admin_resend`.
  - [x] Self-serve recovery: signed-in user identifies the resume by name
    and/or payment id; server confirms the resume is theirs AND paid for
    (entitlement), then emails it to their account address —
    `POST /download-recovery/email-copy` (`selfServeResend`). Blocks a
    resume the user never paid for and a payment that isn't theirs. The
    editor auto-fires this on a post-payment download failure, and a
    `PaidResumeRecoveryForm` on the billing page covers the "came back
    later" case.
  - [x] Pinning tests `tests/download-recovery.unit.test.cjs` (idempotency,
    entitlement gate, reissue guard, support lookup + resend PDF/DOCX,
    self-serve resolve-by-name/payment-id, unpaid + wrong-owner blocks,
    SMTP-missing failure).
- Not in this batch (tracked, deliberately deferred): per-download
  webhook reconciliation for a payment captured at the gateway but never
  verified by the client (stranded `pending` row) — support resend covers
  it manually today.

---

### R-074 · Export reliability: charge-after-render + resilient PDF renderer

- Status: **DONE** (this commit)
- Depends-on: R-003 (export quota), R-073 (recovery)
- Context: two launch-blockers from the pre-launch audit. (1) `generatePdf`
  incremented `pdfExportsUsed` / decremented a referral credit BEFORE
  launching Chrome, so a launch failure, render timeout, or "too busy"
  burned one of the user's paid exports and returned nothing — the exact
  "paid, no file" failure. (2) Every export cold-launched its own Chromium
  with no concurrency cap and no timeouts, so a handful of simultaneous
  exports could OOM Render's starter box or hang a worker forever.
- Acceptance
  - [x] `generatePdf` renders FIRST and charges only AFTER a successful
    render (mirrors `generateDocx`). Pinned by
    `tests/export-quota.unit.test.cjs` ("B1: a failed PDF render does NOT
    charge the user an export").
  - [x] All three export paths (paid export, share-link, R-073 resend) go
    through one `renderHtmlToPdf` in `src/resume/pdf-renderer.ts`:
    a single shared, self-healing Chromium (lazy launch, auto-relaunch on
    disconnect); a concurrency semaphore (`PDF_MAX_CONCURRENCY`, default 2);
    hard timeouts on `setContent` and `page.pdf` (`PDF_*_TIMEOUT_MS`); a
    queue-wait ceiling that returns 503 "busy" instead of piling up; and
    guaranteed page cleanup. Renderer is defensive against partial browser
    objects (test stubs) so it can't crash the export path.
  - [x] Tuning knobs documented in `.env.example`; `pdfRendererStats()`
    exposes live active/queued counts for observability.
- Not in this batch (still open from the audit): env-validation wiring,
  global rate-limit registration, DB-aware health check, error tracking.

---

### R-075 · Security hardening: env validation, rate limiting, DB-aware health

- Status: **DONE** (this commit)
- Depends-on: none (pre-launch blockers from the audit)
- Context: three audit blockers. (1) `validateProductionEnv()` was fully
  implemented but NEVER called, so prod could boot with a missing
  `JWT_SECRET` and sign tokens with the public `'dev_secret'` fallback →
  forgeable admin tokens. (2) `ThrottleModule` existed but was never
  imported into `AppModule`, so nothing was rate-limited. (3) Render's
  health check hit a static `/health` that returns ok even with the DB
  down, so a DB-less instance kept receiving traffic.
- Acceptance
  - [x] `main.ts` calls `validateProductionEnv()` before boot; it hard-fails
    (process.exit 1) in production on a missing/weak/placeholder
    `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, or a
    half-configured Stripe pair. `TOKEN_ENC_KEY` / `REDIS_*` are warn-only
    (the app degrades without them today) so the safety net can't itself
    brick a deploy. Pure `collectEnvIssues` unit-tested.
  - [x] `ThrottleModule` imported into `AppModule`: global 60/min/IP via
    `ThrottlerGuard`, tighter per-route caps on `/auth/register` (8/min),
    `/auth/login` (12/min), `/auth/forgot-password` (6/min). Enforced in
    production only (`shouldSkipThrottle`, honours `FORCE_DISABLE_RATE_LIMIT`);
    health checks and payment webhooks are `@SkipThrottle()` so a gateway
    retry burst can't 429 a payment confirmation.
  - [x] `main.ts` sets `trust proxy = 1` so limiters key on the real client
    IP behind Render's proxy (not the proxy, and not a spoofable XFF chain).
  - [x] Render `healthCheckPath` → `/health/db` (pings Postgres, 503s when
    down) so Render stops routing to a DB-less instance.
  - [x] Verified the full DI graph boots in `NODE_ENV=production` with the
    guard active; tests `tests/security-hardening.unit.test.cjs`.
- Not in this batch (still open): error tracking / alerting (Sentry) and
  moving rate-limit state to Redis for multi-instance correctness.

---

### R-076 · Error tracking / alerting (Sentry, opt-in)

- Status: **DONE** (this commit)
- Depends-on: R-075 (hardening batch)
- Context: audit flagged that prod errors went only to stdout — nobody is
  alerted when payments/exports/DB throw. Wires Sentry as a single capture
  path that is a full no-op unless `SENTRY_DSN` is set (no account friction
  for local/dev or a founder who hasn't set up a project).
- Acceptance
  - [x] `src/observability/sentry.ts`: `initSentry()` (no-op without DSN,
    never throws on init failure), `captureException(err, ctx)`,
    `flushSentry()`, `isSentryEnabled()`. Perf tracing off by default; PII
    off by default.
  - [x] `main.ts` calls `initSentry()` first (so boot failures + unhandled
    rejections are captured), registers a global `SentryInterceptor` that
    reports 5xx / non-HTTP failures and re-throws (4xx client errors are
    NOT reported — expected outcomes, not incidents), and flushes on exit.
  - [x] The swallowed recovery-email failure (`deliverResumeCopy`) — a paid
    user whose resume email failed — is explicitly captured, since it's the
    exact incident support needs and the interceptor can't see it.
  - [x] `SENTRY_DSN` (+ optional `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE`,
    `SENTRY_SEND_PII`) documented in `.env.example` and declared in
    `render.yaml`. Verified the app boots both with and without a DSN.
  - [x] Tests `tests/observability-sentry.unit.test.cjs` (no-op when
    disabled; interceptor re-throws originals and passes successes through).
- Remaining audit item after this: move rate-limit state to Redis for
  multi-instance correctness (fine at the current single instance).

---

### R-077 · Profession-specific resume depth (sections, Medical Coder, profile-matched jobs, JD suggestions)

- Status: **DONE** (this commit)
- Depends-on: R-045 (section order), C-001/C-002
- Context: founder review as a job-seeker: professions/templates existed
  for 21 industries, but the data model was generic — no first-class
  licensure or publications; no Medical Coder profession; job search was
  a blank keyword box not tied to the user's profile; and pasting a JD
  gave no instant resume-content suggestions.
- Acceptance
  - [x] New sections, schema-first (C-001): `licenses[]` (name, authority,
    licenseNumber, region, validTill) and `publications[]` (title, venue,
    year, url, type publication|patent) in `packages/resume-schemas`,
    shared types/DTOs/zod, Prisma columns + migration
    `20260709090000_add_profession_sections`, create/update/duplicate
    persistence, PDF-export HTML blocks, DOCX blocks. Section catalogue
    (C-002) gains `licenses` ("Licenses & Registrations") and
    `publications` ("Publications & Patents"), reorderable, presence-
    gated in `getAtsSectionOrder`.
  - [x] Editor: collapsible Licenses/Publications cards (always shown when
    populated; expanded hint for licensure-heavy industries), included in
    the save payload; ATS-family templates render both sections in
    preview + export.
  - [x] Medical Coder: role in the healthcare profession (ICD-10, CPT,
    HCPCS, CPC, EHR, HIPAA keywords) + `medical-coder` template catalog
    entry (ATS-safe, certifications-first, code-set labels; reuses the
    healthcare component on-screen, dedicated export article with coder
    labels; aliases medical-coding/medical-billing/coder).
  - [x] Job search matches the user's profile: Live Openings pre-fills the
    query from the dashboard-selected profession/role (localStorage) and
    remembers the last search; hint copy tells the user it's editable.
  - [x] JD paste → instant suggestions: pure client-side rule-based
    `src/lib/jd-suggest.ts` (free for every user, no AI call): extracts
    JD keywords across professions, computes matched/missing vs the
    resume, generates a <=60-word tailored summary ("Use this summary"
    one tap), missing-keyword chips ("+ Add to skills"), and 3 bullet
    ideas ("Add as bullet"). AI-powered deep tailor remains the existing
    plan/BYOK flow (R-034).
  - [x] Extraction (phase 2): uploads with LICENSES / REGISTRATIONS /
    PUBLICATIONS / PATENTS headings map into the first-class sections —
    new canonical sections in `resume-intelligence/section-normalizer`
    (licensure synonyms out of certifications, publication synonyms out
    of projects; combined "Certifications and Licenses" stays in
    certifications), structured `mapLicenses` / `mapPublications`
    parsers (name/authority/licence-no/valid-till; title/venue/year/
    patent type), wired through `mapParsedResume`, the API fallback
    builder (`detectHeading`), and the upload `parsedPayload` so the
    editor receives them. Pinned by
    `tests/extraction-profession-sections.unit.test.cjs` (4).
  - [x] Pinning tests: API `tests/profession-sections.unit.test.cjs`
    (catalogue, presence, export HTML incl. licence number + [Patent],
    medical-coder resolution + labels, profession role) and web
    `tests/jd-suggest.test.ts`.

---

### R-078 · Remove LinkedIn OAuth login; harden LinkedIn profile paste-import

- Status: **DONE** (this commit)
- Depends-on: R-007/R-010 (extraction)
- Context: founder decision to drop "Sign in with LinkedIn" for now, plus a
  real bug: the "Import from LinkedIn" box turned a home-feed/messaging
  paste ("Compose message", "messaging overlay", "TEKIVEX picture",
  "Scrolled to top of feed") into 8 phantom companies, and the button /
  instructions were unclear.
- Acceptance
  - [x] "Continue with LinkedIn" login removed from login + register views;
    `LinkedInSignInButton` deleted; `/auth/providers` + `/auth/linkedin`
    client helpers left dormant (annotated) for a future re-enable; llms.txt
    claim corrected. Backend OAuth endpoints remain but unadvertised.
  - [x] Paste-import chrome hardening (`linkedin-import.ts`): a broad
    `LINKEDIN_CHROME_LINE` filter drops global nav, the messaging overlay,
    feed actions, avatar alt-text ("X picture"), promoted posts, degree
    badges and follower counts.
  - [x] Wrong-page guard: `looksLikeLinkedInFeedDump` detects a home-feed/
    app-shell paste (feed markers present, no profile section markers);
    `parseResumeUpload` rejects it with an actionable 422 ("This looks like
    your LinkedIn home feed, not your profile…") instead of inventing jobs.
    The import UI shows the same warning client-side before submit.
  - [x] Import UX: instructions say to copy the PROFILE page (not the feed);
    button relabelled "Build resume from this" with a tooltip clarifying it
    reads the pasted text (no file upload).
  - [x] Tests: `linkedin-import.unit.test.cjs` (+4 — feed-dump detection,
    chrome stripping, upload rejection, real profile still extracts).
    Deleted stale orphaned `login-page-social.test.cjs` (asserted a
    non-existent 4-provider social-auth controller; not run by web CI).

---

### R-079 · Mail delivery diagnostics (why "Email delivery is not configured")

- Status: **DONE** (this commit)
- Depends-on: R-031 (mail), R-073/R-075 (admin surfaces)
- Context: email flows (password-reset OTP, resume copy, support resend)
  failed with "Email delivery is not configured. Contact support." because
  the SMTP env vars aren't set on the server — but the failure was opaque,
  so there was no way to tell WHICH var was missing or whether SMTP auth
  itself was failing (Gmail login password vs App Password).
- Acceptance
  - [x] `MailService` records a precise `reason` at boot (which of
    SMTP_HOST/USER/PASS is missing, or which looks like a placeholder) and
    exposes `getStatus()` (no secrets; username masked), `verifyConnection()`
    (live SMTP handshake → real error), and `sendTestEmail(to)`.
  - [x] Placeholder detection tightened so real creds (a Gmail address, an
    app password, or an address containing "test") are never false-flagged.
  - [x] Admin-only `GET /admin/mail/status` (config + live handshake +
    actionable hint) and `POST /admin/mail/test {to}` (real test send),
    `@SkipThrottle`, AdminAuthGuard.
  - [x] Send-time hardening: TLS mode is auto-derived from the SMTP port
    (587/25 → STARTTLS/secure=false, 465 → implicit TLS/secure=true) so a
    587-with-SSL mix-up (the #1 Gmail "configured but send fails" cause)
    can't silently break delivery. The real send error is captured
    (`lastSendError`) and surfaced by `GET /admin/mail/status`, so a 503
    "Failed to send reset email" is diagnosable without Render logs.
  - [x] Tests `tests/mail-config.unit.test.cjs` (6): missing-vars reason,
    Gmail accepted + masked, placeholder rejected, no false positive,
    port→TLS auto-derivation, lastSendError exposure.
  - Note: this is DIAGNOSTICS + robustness — actually enabling mail is an
    ops step (set SMTP_HOST/PORT/USER/PASS/FROM on Render; Gmail needs an
    App Password). render.yaml already declares the slots (sync:false).

---

### R-081 · Tekivex calendar, market/AI skills, profession templates

- Status: **DONE** (this commit)
- Depends-on: R-045 (templates), R-077 (professions), R-080 (tekivex)
- Acceptance
  - [x] Date fields use tekivex `TkxDatePicker` (calendar) via a
    `MonthYearPicker` wrapper that round-trips the canonical `YYYY-MM`
    string across all 8 date inputs (experience/education/projects/
    certification/license), preserving the "Present" toggle.
  - [x] Technical-skill seeds (web + API) expanded 450→567 with current
    market skills, heavy on GenAI/ML (LLMs, RAG, agents, MCP, vector DBs,
    fine-tuning, MLOps, modern data/cloud/security).
  - [x] New profession-tuned templates `ai-ml-engineer` (AI/ML/data roles)
    and `product-manager` (product/business) — catalog + web registry +
    API export renderer with role labels + profession recommendations +
    aliases (ai-engineer/ml-engineer/data-scientist → ai-ml-engineer).
    Pinned by `tests/profession-sections.unit.test.cjs`.

---

### R-084 · BYOK end-to-end fix, provider model option, subscriber token cap

- Status: **DONE** (this commit)
- Depends-on: R-071 (monetization/BYOK), R-011 (per-plan AI limits)
- Problem (founder, pre-prod): a free user who added their own Groq key
  got an error on AI Critique and was still nagged to "add a key or
  subscribe" on every AI surface; the same nag persisted after
  subscribing to ₹499.
- Acceptance
  - [x] BYOK requests actually reach the API: `X-User-AI-Key`,
    `X-User-AI-Provider`, `X-User-AI-Model` added to CORS
    `allowedHeaders` (`main.ts`). Previously the browser preflight
    blocked every BYOK AI call → surfaced as "AI Critique error". This
    was the root cause and is BYOK-specific (only BYOK attaches the
    custom headers).
  - [x] BYOK is exempt from the free daily-critique cap (`ai.service.ts`
    `aiCritique`): a user on their own key no longer hits a spurious
    403 after N/day.
  - [x] The "add your own AI key / get the ₹499 plan" upsell copy in the
    rule-based fallback critique (`buildFallbackCritique`) and the editor
    snackbar is gated on entitlement: BYOK/paid users get a neutral
    "AI momentarily unavailable, retry" message instead of a nag for
    something they already have (C-003).
  - [x] BYOK headers added to the AI api calls that were missing them
    (`parseJd`, `critique`, `skillGap`, `tailorApply`) so every AI path
    honours the user's key.
  - [x] Provider-specific BYOK options: Groq is key-only; OpenAI and
    Anthropic accept an optional model name (`X-User-AI-Model`, default
    per provider) surfaced as a field in `ByokKeyCard`. Threaded through
    `getByokHeader` → `byokFromReq` → `buildByokProvider(provider,key,model)`.
    Pinned by `byok-storage.test.ts` (+5) and `byok-factory.unit.test.cjs` (+2).
  - [x] Subscriber (₹499 `PRO`) AI token allowance sized for Groq
    profitability: `aiTokensLimit` 120k → 750k accounted input tokens
    (~₹100 API cost at the cap, ~20% of ₹499; ~1,000 AI actions/mo).
    See `plan-limits.ts` `getPlanConfig`.

---

### R-085 · Admin AI-key health check (is our Groq key working?)

- Status: **DONE** (this commit)
- Depends-on: R-084 (BYOK/server AI), R-079 (mail-status pattern)
- Acceptance
  - [x] `GET /admin/ai/status` (admin-guarded, throttle-skipped) returns a
    no-secrets config snapshot (`provider`, `model`, `configured`,
    `keyPresent`) PLUS a live Groq handshake (`reachable`, `error`,
    `latencyMs`) and an actionable `hint`. Mirrors `admin/mail/status`.
  - [x] `POST /admin/ai/test` runs the same live handshake on demand.
  - [x] `verify()` NEVER reports ok when no server provider is configured
    (no false-positive; C-004), and scrubs any key-like token from error
    bodies (`gsk_***`, `Bearer ***`).
  - [x] `buildAiHint` maps Groq 401 / 404 (model) / 429 / timeout to a
    specific next step. Pinned by `tests/ai-health.unit.test.cjs` (8).

---

### R-086 · Resume-page AI on our key (free, daily-capped); off-page BYOK/subscribe

- Status: **DONE** (this commit)
- Depends-on: R-084 (server AI / BYOK), R-085 (key health)
- Founder decision: OUR Groq key is spent ONLY on the Edit Resume page. There
  it powers every AI button for all users; everywhere else stays BYOK-or-plan.
- Acceptance
  - [x] On the resume page, AI Critique / Rewrite / JD-match (Scan job
    skills) / Tech Gap / Tailor run on OUR Groq key for BYOK (own key),
    ₹499 plan (uncapped), AND free users — no ₹20 fee, no subscribe wall.
  - [x] Free users are capped at **10 our-AI actions per user per day**
    (shared across all resume AI buttons; env `AI_FREE_MAX_REQUESTS_PER_DAY`).
    BYOK and plan users are not day-capped. Cap throws a typed exception
    naming the remediation (BYOK / plan / wait) — C-004. Shared helper
    `ai/resume-ai-access.ts` reuses the `AiCritiqueLog` table (no migration).
  - [x] Removed the resume-page ₹20 AI opt-in fee + opt-in dialog
    (`flagResumeAiAssist` calls, `aiOptInPrompt` modal). Free users just
    use the AI directly.
  - [x] OFF the resume page (Mentor, Interview, Mock, Recruiter, Skill-demand,
    Cover-letter, Sahaayak) our key is unchanged: only BYOK or an active plan
    spends it — free users still get rule-based/upsell (verified, no leak).
  - [x] Provider routing per user state is centralized in
    `resolveResumeAiProvider` (BYOK → own key, never our key; plan → our key;
    free → our key day-capped; no server key → null) and pinned by
    `tests/resume-ai-access.unit.test.cjs` (14). Full API suite green (545).

---

### R-087 · Launch-readiness batch: live jobs on, crons wired, trust badge, outcome hero

- Status: **DONE** (this commit) — umbrella for the pre-launch uniqueness
  push; also delivered R-050 Phase 1 and the R-043 channel (see those IDs).
- Depends-on: R-031 (nudges), R-038 (outcomes), R-085 (admin status pattern)
- Acceptance
  - [x] `GET /admin/jobs/status` — Adzuna config snapshot + live probe +
    actionable hint (mirrors admin/mail + admin/ai). `ADZUNA_*` and
    `CRON_SECRET` env vars declared in render.yaml (values are founder ops).
  - [x] render.yaml gains two `type: cron` services (curl image) firing
    `POST /outcome-nudge/run` (03:30 UTC) and `POST /job-alerts/run-cron`
    (04:00 UTC) with `x-cron-secret` — the endpoints existed since R-031/032
    but nothing triggered them in prod until now.
  - [x] "No fake numbers" trust note (`AiTrustNote`) on the editor AI
    toolbar, JD Match, and Cover Letter Studio + a home-page FAQ entry —
    claim verified against the actual prompts (every AI system prompt
    carries a do-not-invent rule; C-003).
  - [x] Dashboard `CallbackRateCard` now surfaces the per-version lift
    headline ("vN gets X× more replies") the moment the API computes one —
    the Outcome Graph sells itself from the dashboard.
  - [x] MCP package publish-ready: `publishConfig.access=public`,
    repository + keywords metadata; builds + packs clean (6 kB). `npm
    publish` remains a founder action (needs the npm account).
  - [x] Extension store runbook: `resume-builder-extension/STORE_LISTING.md`.

---

### R-088 · Rebrand to CallbackCV + visual-template export gate fix

- Status: **DONE** (this commit)
- Depends-on: R-045 (visual templates), R-087 (launch batch)
- Acceptance
  - [x] Product renamed **CallbackCV** (house brand Tekivex) after name-collision
    research killed "Pocket Resume" (identically-named resume apps live since
    2010 on the App Store / Play Store). All user-facing copy, SEO landers +
    JSON-LD, PWA manifest, plan name ("CallbackCV Plus"), PDF watermark
    ("CALLBACKCV"), DOCX metadata, mail templates, MCP package
    (`@tekivex/callbackcv-mcp`), and extension name updated. Emails moved
    `@pocketresume.app` → `@tekivex.com`. Internal identifiers / env vars /
    repo names intentionally unchanged; domain migration is a separate ops task.
  - [x] Sidebar Bold download bug: `validatePdfExportSafety` no longer applies
    the ATS-safety gate ("|" / bullet-glyph rejection, min score) to visual
    showcase templates (`sidebar-bold`, `accent-header`, `creative`) — they are
    explicitly sold as "Not ATS-safe", so blocking them on ATS rules was a
    contradiction (hit with imported resumes). ATS-family templates and
    legacy no-templateId callers keep the strict gate. Pinned by
    `tests/visual-template-export-gate.unit.test.cjs` (5).

---

### R-089 · Pre-signup funnel: public gallery, free ATS check, pricing page, callback-first hero

- Status: **DONE** (this commit)
- Depends-on: R-088 (rebrand), R-041 (stateless scoring)
- Source: full product critique (local Playwright walkthrough of 26 routes +
  2026 market research). Top finding: every pre-signup conversion asset was
  auth-walled and the differentiator was invisible on the home page.
- Acceptance
  - [x] `/templates` (+`/templates/preview`) is PUBLIC: logged-out visitors get
    the full gallery + live preview rendered with the sample resume, a
    non-blocking sign-up banner, and ZERO authenticated API calls (no doomed
    401s). Logged-in behavior unchanged. Pinned by
    `tests/templates-public-gallery.test.tsx` (4).
  - [x] Anonymous ATS check: `POST /public/ats-check` (no auth) reuses the
    existing `scoreFreeText` engine — no AI call, no DB write, text processed
    in-memory only (stated in the response disclaimer). Rate-limited 3/IP/day
    with a C-004-style message naming the remediation. Widget on
    `/ats-resume-checker` (paste-text; file upload honestly deferred to
    signed-in parsing). Pinned by `tests/public-ats-check.unit.test.cjs` (6)
    + web api test (2).
  - [x] Public `/pricing` page: the complete price list (free build / ₹49
    download / ₹499 Plus) shown before a user invests build time — the
    counter to the category's most-resented hidden-paywall pattern.
  - [x] Home hero leads with the callback-measurement differentiator;
    logged-out nav gains Templates / ATS Check / Pricing / Why CallbackCV.
  - [x] Trust copy made true (C-003): "Local-first privacy" claim removed
    (storage is server-side), FAQ privacy answer rewritten, "Sync across all
    your devices" reworded to the true claim, `/resume-builder-india`
    "Sub-₹400/month" contradiction fixed, "The moat." removed from user copy.
  - [ ] Follow-ups (Week 2-3 of the critique plan): guest resume draft,
    home-page "Paste a JD" entry, hub consolidation, worked-example empty
    states, kill anonymous-page authed calls, register `next=` param.

---

### R-090 · The journey: guest drafting, JD quick start, worked-example empty states

- Status: **DONE** (this commit)
- Depends-on: R-089 (public funnel)
- Acceptance
  - [x] Guest resume drafting: /resume/start and the editor work WITHOUT an
    account — drafts autosave to localStorage (`rb_guest_draft`) with an
    honest "on this device only" banner; gated actions (export/AI/ATS)
    show a signup dialog instead of silently failing; after signup/login
    the draft is imported into a real resume and the key cleared. No
    authed API calls fire in guest mode. Pinned by tests/guest-draft (7).
  - [x] Home-page "Paste a JD" quick start → /jd-match consumes
    `rb_pending_jd` once on mount (read + remove).
  - [x] Logged-out /jd-match and /interview-prep render labeled worked
    examples (sample match report / sample question cards) above the
    sign-up CTA instead of one-sentence dead ends; zero API calls.
    Pinned by tests/logged-out-samples (3).
  - [x] /auth register+login honor a validated ?next= param (must start
    with '/', open-redirect guarded) and the public gallery CTAs carry
    next=/resume/start&template=<id>. Pinned by tests/auth-next-param (5).
  - [x] Anonymous pages no longer fire doomed authed calls: the session
    heartbeat starts only with a token and re-arms on auth-state-changed.
    Pinned by tests/session-heartbeat-guard.
  - [x] AI hub cards state cost honestly ("Free with your own AI key ·
    included in Plus ₹499/mo").
  - [x] Scope decision: Coach+Applications hub merge intentionally NOT
    done (zero overlapping tools; pinned R-036 IA; an 11-card mega-hub
    would worsen the complaint). Revisit only on founder call.

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
| 2026-07-16 | Rebrand to CallbackCV (by Tekivex): all user-facing copy renamed from "Pocket Resume" to "CallbackCV" (house brand Tekivex, tagline "CallbackCV by Tekivex") — web copy/metadata/SEO landers/PWA manifest, plan name "CallbackCV Plus", support/track emails moved to @tekivex.com, PDF/CSS watermark "CALLBACKCV", MCP package renamed `@tekivex/callbackcv-mcp` (bin `callbackcv-mcp`), extension renamed "CallbackCV — Job Hunt Companion". Internal doc bodies (strategy/requirements text) intentionally left as-is. | Name-collision research: "Pocket Resume" apps have existed since 2010 plus current Play Store listings; a distinct, ownable brand was needed before launch. | R-088 |
| 2026-07-20 | The journey batch (R-090): guest drafting end-to-end (localStorage draft, signup-gated actions, post-auth import), home-page Paste-a-JD quick start wired into /jd-match, worked-example empty states for jd-match/interview-prep, validated ?next= auth redirects, anonymous-page 401s eliminated (token-guarded heartbeat), AI-card cost lines. Hub merge deliberately skipped (see R-090). | Critique Week 2-3 plan; founder approved starting the sequence. | R-090, R-089, R-036 |
| 2026-07-19 | Pre-signup funnel opened (R-089): product critique (Playwright walkthrough + market research) found the funnel died at the first click — templates auth-walled, no try-before-signup, differentiator buried, no public pricing, trust-copy contradictions. Shipped: public sample-data template gallery, anonymous rate-limited ATS check (reuses scoreFreeText, no storage), public /pricing page, callback-first hero, public nav links, and five truth fixes to privacy/pricing copy. | Founder: "make this the top choice for job hunters — test it like a critic." | R-089, R-088, R-041, C-003 |
| 2026-07-15 | Launch-readiness batch (R-087): turned the "unshipped uniqueness" into shipped surface — Adzuna admin diagnostics + env plumbing (feed was fully built but keys were never declared), TWO render.yaml cron services so outcome nudges + job-alert digests actually fire in prod (endpoints existed since R-031/032, nothing triggered them), WhatsApp channel (R-043 PARTIAL: env-gated, per-user opt-in still required before enabling — Meta consent policy), benchmark insights Phase 1 (R-050 DONE: median response-rate card, ≥5-apps/≥10-users privacy gate), "no fake numbers" AI trust note (verified against prompts, C-003), dashboard lift headline, MCP publish metadata, extension store runbook. | Founder: execute research points 1–8 pre-launch; market data shows ghosting (55%), fabricated AI metrics, and WhatsApp-first alerts are the wedge. | R-087, R-050, R-043, R-040, R-033, R-031 |
| 2026-07-14 | Resume-page AI on our key, free + daily-capped (R-086): OUR Groq key is now spent ONLY on the Edit Resume page, where AI Critique / Rewrite / JD-match / Tech Gap / Tailor run for ALL users — free users included — with NO ₹20 fee and NO subscribe wall, protected by a per-user cap of 10 our-AI actions/day (shared across all resume AI buttons; `AI_FREE_MAX_REQUESTS_PER_DAY`). Removed the ₹20 opt-in fee + dialog. Off the resume page (Mentor/Interview/Mock/Recruiter/Skill-demand/Cover-letter/Sahaayak) our key stays BYOK-or-plan only — free users get rule-based/upsell (verified, no leak). New shared helper `ai/resume-ai-access.ts` reuses `AiCritiqueLog` (no migration). | Founder: make the resume page the free AI hook on our cheap Groq key; everywhere else require the user's own key or a subscription; hard daily cap so free Groq data isn't exhausted. Decisions (free-not-fee, 10/day) approved by founder. | R-086, R-084, R-071 |
| 2026-07-13 | Admin AI-key health check (R-085): added `GET /admin/ai/status` + `POST /admin/ai/test` (admin-guarded, mirrors admin/mail/status) — config snapshot + a live Groq handshake with an actionable hint (401→bad key, 404→model not available, 429→rate/quota, timeout→egress), so ops can confirm the operator Groq key works without shelling into Render. Never returns/logs the key (scrubbed). Pinned by `ai-health.unit.test.cjs`. | Founder asked how to verify the added Groq key is working; there was no equivalent of the mail health check for AI. | R-085, R-084 |
| 2026-07-12 | Web CI stabilization (R-084): fixed three stale/pre-existing web-test failures blocking the BYOK PR — (1) `template-registry.test.ts` keyed a hardcoded id→component map that never covered the profession templates (medical-coder/ai-ml-engineer/product-manager) so it read `undefined.tsx`; now keys off the registry `componentKey`; (2) `login.page`/`email-otp-login.page` register tests still filled a `/mobile/i` field the email-only register form dropped — removed. Also QUARANTINED the heavy `dashboard-auth-flow.test.tsx` (13-template live-render jsdom file) in `scripts/test.mjs`: it now runs as a separate ADVISORY step whose result is non-blocking (it SIGKILLs on React-18 teardown locally and races its async-render assertions in CI). Every other file stays strictly enforced; the accepted tradeoff is that a regression inside that one file alone won't fail CI until these render tests move to Vitest. | Founder wanted PR #103 mergeable/green; the flake was pre-existing and unreproducible locally (container too slow to finish the render before timeout). Decision approved by founder. | R-084 |
| 2026-07-12 | BYOK end-to-end fix + provider model + subscriber token cap (R-084): root-caused the "AI Critique error on own Groq key" to the CORS preflight blocking the BYOK headers — added `X-User-AI-Key`/`X-User-AI-Provider`/`X-User-AI-Model` to `allowedHeaders`. Also: exempted BYOK from the free daily-critique cap; gated the "add key/subscribe" fallback copy (server + editor snackbar) on entitlement so BYOK/paid users aren't nagged; added missing BYOK headers to `parseJd`/`critique`/`skillGap`/`tailorApply`; added an optional model field for OpenAI/Anthropic (Groq stays key-only); sized the ₹499 PRO `aiTokensLimit` to 750k accounted tokens (~₹100 Groq cost at the cap, ~20% of ₹499). | Founder pre-prod: own-key AI Critique errored and every AI page kept asking to add a key or subscribe even after adding a key / subscribing — "our failure". | R-084, R-071, R-011, C-003, C-004 |
| 2026-07-09 | Gmail send hardening (R-079): eliminated the two most common Gmail send-rejection causes — a pasted App Password with display spaces ("abcd efgh…") is now stripped for Gmail hosts, and the From address is forced to the authenticated mailbox (keeping any display name) so a mismatched SMTP_FROM can't get the send silently rejected; added requireTLS on STARTTLS ports. Real send error remains visible via lastSendError / logs. | Founder: forgot-password consistently "Failed to send" with correct-looking SMTP. | R-079 |
| 2026-07-09 | Password-reset ordering fix (R-079): the reset challenge (+60s cooldown) was created BEFORE the email send, so a failed first send left a challenge behind and the retry returned a fake "a code was just sent" while no email ever went out. Now SMTP is checked and the email is sent FIRST; the challenge is persisted only after a successful delivery — failures create nothing, so the user always sees the real error and can retry. | Founder: forgot-password flashed "not configured" then "code sent, wait 60s" but no mail arrived. | R-079 |
| 2026-07-09 | Mail diagnostics (R-079): email flows failed opaquely with "Email delivery is not configured" because SMTP env isn't set on the server; added precise boot-time reason, admin GET /admin/mail/status (config + live SMTP handshake + hint) and POST /admin/mail/test, and tightened placeholder detection so real Gmail creds aren't false-flagged. Enabling mail remains an ops step (set SMTP_* on Render; Gmail App Password). | Founder: mail not working, "not configured" with no way to see why. | R-079 |
| 2026-07-09 | LinkedIn (R-078): removed "Sign in with LinkedIn" login (founder call); hardened the LinkedIn profile paste-import — strips app chrome (nav/messaging overlay/feed/avatar alt-text) and rejects a wrong-page home-feed paste with actionable guidance instead of building 8 phantom companies; clearer import instructions + button. | Founder dropped LinkedIn OAuth for now; a home-feed+messaging paste was mis-parsed into 8 fake jobs and the button was confusing. | R-078 |
| 2026-07-09 | Profession depth (R-077): first-class `licenses` + `publications` sections end-to-end (schema→prisma→editor→preview→PDF/DOCX export); Medical Coder profession role + ATS-safe `medical-coder` template; Live Openings pre-filled from the user's selected profession; free client-side JD→suggestions (tailored summary, missing-keyword chips, bullet ideas) on JD paste. | Founder walked the product as a job-seeker across IT/mechanical/medical/teacher/doctor profiles: generic schema shortchanged licensed/academic professions, no coder template, job search ignored the profile, and JD paste gave no instant help. | R-077, R-045, C-001, C-002 |
| 2026-07-08 | Error tracking (R-076): wired Sentry as an opt-in, no-op-without-DSN capture path — global interceptor reports 5xx/non-HTTP failures (4xx skipped), boot failures + unhandled rejections captured, and the swallowed paid-user resume-email failure is explicitly reported. Closes the "flying blind in prod" gap. | Pre-launch audit: prod errors went only to stdout; nobody alerted when payments/exports/DB throw. | R-076 |
| 2026-07-08 | Security hardening (R-075): wired the dead `validateProductionEnv()` into boot (hard-fail on missing/weak JWT/DB/CORS secrets in prod; REDIS/TOKEN_ENC_KEY warn-only so the net can't brick a deploy); registered the never-imported `ThrottleModule` (60/min global + tight auth-route caps, prod-only, webhooks/health exempt); `trust proxy=1` for real client IPs; Render health check moved to DB-aware `/health/db`. | Pre-launch audit blockers: forgeable tokens via `dev_secret` fallback, zero rate limiting, and a DB-down instance reported healthy. | R-075 |
| 2026-07-08 | Export reliability (R-074): `generatePdf` now renders before charging (a failed/timed-out/too-busy render no longer burns a paid export — mirrors `generateDocx`); all export paths share one resilient, concurrency-capped, timed-out Chromium via `pdf-renderer.ts` (shared browser, semaphore, setContent/pdf timeouts, 503-on-busy) instead of a per-request cold launch that could OOM Render or hang a worker. | Pre-launch audit blockers: PDF charge-before-render mischarge (the "paid, no file" case) + unbounded Chromium concurrency/no timeouts. | R-074, R-003, R-073 |
| 2026-07-08 | Added paid-but-couldn't-download recovery (R-073): PaymentHistory now links resumeId+email+fulfilledAt; createOrder is idempotent (no double-charge, free re-download of an already-paid resume); downloads gate on token OR paid entitlement so a lost/expired token still works; every export emails+logs a copy (PDF and DOCX) via ResumeEmailLog; new admin/support console looks up a payment by email and resends the resume by email (no re-charge, no quota hit). Email-only support, no phone. | Founder: a user who pays and then can't download had no recovery — no payment→resume→email link, no re-download, no support tool, and a possible double-charge. Deep audit also surfaced launch-blockers (env-validation dead code, throttling unregistered, PDF charge-before-render) deferred to a later batch per founder scope. | R-073, R-003, R-071 |
| 2026-07-07 | Rebuilt the rule-based bullet remediation on one clause engine (`buildBulletCandidates`): splits on subordinate/participial connectors (not just commas) so a long single-sentence bullet tightens; drops leaked job-title clauses, dangling truncated fragments ("…recognized by"), and filler; ranks impact-first; pads single-idea rewrites with verb variants. An in-range bullet with droppable junk is now cleaned too (not just verb-swapped). Web mirror gains `shortenBulletText` + a "Shorten to one bullet" editor action. | Founder screenshots: over-limit bullets still got useless verb-swap-only rewrites and echoed extraction garbage; accepting a suggestion never cleared "exceeds 28 words". | R-072, R-006, R-071 |
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
| 2026-06-15 | R-045 section reorder scoped to the 7 single-column ATS templates only (preview + export); visual templates keep fixed layouts | Two-column/banded layouts (sidebar/accent/creative) don't map to a linear body order; the reorder value is in the ATS family. The 7 ATS templates were unified onto one shared `OrderedAtsSections` renderer that mirrors the export, which also closed pre-existing preview↔export drift (languages modifier class; achievements position in academic/healthcare). Export ordering is now authoritative. | R-045 |
| 2026-06-16 | Resume contact validation: email + phone now validated in the editor (inline error + blocks autosave/save) AND in `ContactSchema` (zod). Phone rule lives in `resume-builder-shared/src/auth.ts` (`isValidPhone`): E.164 `+` 8–15 digits, or local 10-digit, or trunk-0 — rejecting garbage like "173537282727". | Founder blocker: a malformed email and an invalid 12-digit phone were saved unchecked; the schema only had `phone.min(6)`. | C-003 |
| 2026-06-16 | Monetization pivot completed: removed Student/Pro tiers; all AI features (recruiter-sim, bullet-rewriter, AI critique, JD-match, cover-letter, tailor, skill-demand) converted to BYOK-or-rule-based-fallback (no plan throw, no app-key spend); stripped subscription UI (billing page → ₹49/download + BYOK explainer, TopNav plan badge → Pricing link, removed dashboard PlanBenefitsCard, FreeAiNotice/skill-demand reworded, ByokKeyCard always shown). | Founder decision: subscriptions are wrong for a transactional product; AI is commodity → BYOK. Pre-launch so no grandfathering. | C-003, R-005, R-040 |
| 2026-06-16 | Session fixes: reset `rb_session_start` on every login/refresh (stale value made the expiry modal fire ~5 min after login) and fixed "Continue session" reading non-existent `rb_`-prefixed token keys (it force-logged-out instead of refreshing). | Founder report: 5-min sessions for some users + "Continue session" logging users out. | — |
| 2026-06-16 | Auth copy/validation fixes: password min length unified to 10 via a single shared constant (`resume-builder-shared/src/auth.ts`) consumed by API + web + mobile (inputs said "Min 8" while the server enforced 10 — a C-003 violation); added clear client-side email validation message replacing the generic native tooltip | Founder smoke-test: register showed "Min 8 characters" then server rejected with "at least 10"; and a malformed email surfaced only the browser's terse "Enter an email address". | C-003 |
| 2026-06-16 | Pre-prod fixes: (1) extraction mapping re-joins PDF-wrapped bullet fragments into whole sentences + imported-mode "break it down" hint; (2) Sahaayak workspace grid collapses to 1 col ≤768px; (3) share-links resume `<select>` ellipsis/overflow; (4) public share-link PDF download now watermarked (quota-bypassing path) | Founder smoke-test on prod URL surfaced 4 issues: meaningless bullet fragments in inputs (R-007/R-010 population logic), two mobile CSS overlaps, and a request to let recruiters download a watermarked copy from the public share page (R-038). Watermark is server-side in `renderResumeTemplateHtml` so preview/export share one path. | R-007, R-010, R-038, R-003 |
| 2026-06-15 | R-045 profile photo stored as a size-capped base64 `data:` URI, not object storage; rendered only on the 2 visual templates; `headerStyle` descoped | No S3/Cloudinary in this stack and CSP already allows `data:` for img-src, so a downscaled (≤512px) data URI is self-contained and keeps preview↔export parity for free. Photo is the region-aware (India vs US/ATS) differentiator; ATS templates + ATS-safe exports always omit it (§9.5). A separate `headerStyle` axis added complexity without a user ask. | R-045 |
| 2026-06-15 | R-045 (design customization) scoped as a phased plan, not a single rushed change | Accent theming touches 10 template CSS blocks + the separate server export renderer + a missing token layer + parity tests + a migration + CSP/fonts. Shipping it hastily risks breaking PDF export and §9 parity. Plan in docs/DESIGN_CUSTOMIZATION_PLAN.md; Phase 1 ships as its own PR. | R-045 |
| 2026-06-21 | Closed a no-payment plan bypass (C-004): `/billing/upgrade` (directUpgrade) and `/billing/add-credits` set a paid plan / credits with NO payment behind only `JwtAuthGuard`, so any logged-in user could self-upgrade to ₹499 "Plus" for free (and, being seen as a subscriber, never got the ₹20 AI opt-in). Both are now `AdminAuthGuard`-gated (ops/seed only). Real upgrades stay on the signature-verified Razorpay `verify-payment` path. Added a "Cancel plan (switch to Free)" button on the billing page (honors the "Cancel anytime" copy and lets a wrongly-upgraded account reset). | Founder testing: clicking Get Plus showed "You're on Plus" with no payment window; plan was active without paying. | R-071, R-003 (C-004) |
| 2026-06-20 | Monetization tightened (dev-testing, no real users so no grandfathering): (1) free-user OUR-AI access narrowed to exactly TWO editor features — AI Critique + Tech Gap — which flag `aiAssistUsed` for the per-download AI fee; (2) bullet rewrite, JD-match, tailor de-gated from free OUR-AI → BYOK-or-₹499-plan, else rule-based (tailor blocks); (3) ₹499 plan users now download FREE (`createOrder` returns an included token, no Razorpay); (4) Tech Gap wired through auth + BYOK + resumeId (was anonymous, always-our-AI); (5) AI fee disclosed in the download modal; copy corrected to match (C-003). "All users pay to download" is enforced via `ENABLE_DOWNLOAD_CHARGE=true` (ops). | Founder: BYOK-only/flat-free model leaked our AI everywhere; restrict app-AI to the two resume-page features (charged at download), make the plan the only way to skip download charges, hard-block elsewhere. | R-071, R-003 |
| 2026-06-19 | Monetization refined (supersedes the 2026-06-16 "no plans" pivot): (1) resume-upgrade AI without a key now runs OUR AI and adds a flat per-download AI fee (`Resume.aiAssistUsed` flag, `aiFeeApplies()`), waived on the ₹499 plan; (2) reintroduced a SINGLE ₹499/mo plan ("Pocket Resume Plus", internal `PRO`, Razorpay `PRO_MONTHLY`=49900 paise) as the only subscription; (3) non-resume AI (Mentor, Interview-Prep, Recruiter-sim, Skill-demand, Cover-letter) gated to BYOK-or-plan with rule-based baseline + upsell (no app-key spend for free/key-less/plan-less users), shared gate in `src/ai/server-provider.ts`; (4) web copy purged of Student/Pro and ₹199/₹399/₹799. | Founder decision: BYOK-only left no revenue from non-key users; charge a flat AI fee on download for our-AI resume help, and offer one ₹499/mo plan for everything-AI. | R-071, R-003, R-005 |

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
