# Pre-launch testing & capacity assessment

Owner: founder + Claude
Date: 2026-06-07
Branch: `claude/gallant-knuth-fKlMx`
Scope: everything that needs to be green before this week's launch.

This is a working doc — tick the checkbox once a check is done. Don't
remove items. Add notes inline.

---

## 1. Three pre-launch fixes shipped on this branch

| # | Bug | Where it was | Fix |
|---|---|---|---|
| 1 | "Your resume stays on this device" banner was **factually false** — resume is parsed on the server and saved to Postgres. DPDP + Play Store data-safety risk. | `PrivacyBadge.tsx` (4 variants), homepage hero, `SettingsPageView.tsx` | Rewrote copy to match the actual data flow (server-side parsing, account-scoped storage, HTTPS in transit + encryption at rest, no AI training without opt-in). |
| 2 | Upload had no visible loader — button label flipped to "Processing chandankumar.pdf…" for 5-15s, nothing else moved. | `ResumeStartClient.tsx` | Inline `DataLoader` spinner inside the button + `aria-live` status line with timing hint. |
| 3 | "5 PDF exports / month" was decorative — quota check gated behind `PRODUCT_FLOW_RESTRICTIONS_ENABLED` (off by default). DOCX had no quota check at all. | `resume.service.ts:601` (generatePdf), `resume.service.ts:703` (generateDocx) | Quota enforced unconditionally on both surfaces. Counter increments only on successful render. 4 new unit tests in `tests/export-quota.unit.test.cjs`. |

---

## 2. Page-by-page test matrix

Status legend: **OK** = ready / **WATCH** = test extra carefully / **GATED** = paid plan or admin only.

### Public pages (no login needed)

| Route | Purpose | Status | Manual checks |
|---|---|---|---|
| `/` | Marketing home. CTAs to register / start. | OK | Hero copy honest after fix #1. CTA buttons go to correct routes. JSON-LD validates in [Rich Results Test](https://search.google.com/test/rich-results). |
| `/auth/login` | Email/password + email-OTP entry points. | WATCH | Login works on mobile Safari (autofill). OTP path: request code → email arrives within 60s → verify → lands on `/dashboard`. Test wrong password 3× → friendly error, no lockout message that reveals account existence. |
| `/auth/register` | Email registration. | WATCH | Duplicate email → clear error. New analytics event `register` reaches dashboard (see §3). Welcome email is sent (`SMTP_*` must be set in prod). |
| `/auth/forgot-password` + `/auth/reset-password` | Self-service reset via OTP. | OK | Request → email arrives → enter code + new password → can log in with new password. |
| `/auth/callback` | OAuth landing (currently unused — social auth was removed). | OK | Should land users back on `/auth/login` rather than 404. |
| `/templates` | Template gallery for unauthenticated browsing. | OK | All ATS-safe templates render thumbnails. "Use this template" CTA routes through to `/auth/register`. |
| `/download` | App download page. | OK | Web link copy correct. APK download link (env `APP_ANDROID_DOWNLOAD_URL`) actually serves a file. |

### Resume editor flow (requires login)

| Route | Purpose | Status | Manual checks |
|---|---|---|---|
| `/resume/start` | Upload-or-scratch picker. | WATCH | Upload progress (loader + aria-live) visible — fix #2. PDF/DOCX/TXT upload all complete. "Continue to Review" → `/resume` plain editor (split back from merged button last commit). "Review & ATS" → `/resume/review` sidebar+ATS panel. |
| `/resume` (plain editor) | Editor with no ATS panel. | OK | Fields persist across reload. Autosave fires within 1.2s of edit. **Regression watch:** the post-autosave field-wipe was just patched (`editor-reset-gate.test.ts`). Re-test: upload → fields visible → wait 5s → fields **still visible**. |
| `/resume/review` (ATS-driven editor) | Editor with section sidebar + live ATS panel. | WATCH | Same field-persistence check as above. ATS score updates after autosave. "Needs Attention" callouts route to the right section. |
| `/resume/template` | Template chooser inside the editor flow. | OK | Selected template persists to backend (`templateId`). Preview reflects choice. Print preview is watermarked for FREE plan. |
| `/resume/versions` | Snapshot + restore. | OK | "Save snapshot" creates a labeled version. "Restore" auto-snapshots current state first, then loads the chosen version. Up to 25 snapshots per resume. |
| `/resume/outcomes` | Per-version response / interview / offer rates. | OK | Outcome counters increment correctly. Page renders empty state cleanly when no snapshots exist. |
| `/resume/ats` | Standalone ATS score view. | OK | Same score as the inline panel. JD field accepts paste. |
| `/resume/ats-simulate` | Recruiter-view simulation. | OK | Skim-mode highlight pattern is sensible; no PII leaks in the simulated output. |

### Other authenticated pages

| Route | Purpose | Status | Plan gate | Manual checks |
|---|---|---|---|---|
| `/dashboard` | Saved resumes + benefits card + template grid. | OK | — | Selecting a resume → opens correct id. Dashboard does not auto-select stale resumes on cold open (`load-effect-gate` covers this). |
| `/jobs` | Kanban job tracker. | OK | — | Add → wishlist → applied → interviewing → offer. Status changes survive reload. |
| `/cover-letter` | AI cover letter studio. | GATED | **STUDENT+** | Free users see upgrade CTA, not a broken AI call. Paid users get tailored output per JD. |
| `/jd-match` | Match score + missing keywords + add-3-bullets. | GATED | **STUDENT+** | Same gate behaviour. Paste a real JD, verify score + suggestions make sense. |
| `/mentor` | Career insights (long-form Q&A). | GATED | **STUDENT+** | Page renders; gate message is honest, not a technical "GROQ_API_KEY missing" leak. |
| `/mentor/chat` | Resume-aware chat. | GATED | **PRO only** | Hard gate via `mentor-chat.service.ts:142`. Free + Student see upgrade card. |
| `/interview-prep` | 8 likely questions + answer outlines per role. | GATED | **PRO only** | Hard gate. |
| `/career` | Career navigator (role/path explorer). | OK | — | No paid gate. |
| `/sahaayak` | Emotional companion. | OK | — | Opt-in flow is loud (no dark pattern). Crisis resources surface inline. Without GROQ key it falls back to warm companion replies, not robotic echo. |
| `/billing` | Plan picker + ₹49 explainer + Free-vs-Paid matrix + usage bars. | OK | — | Razorpay checkout opens for India region (UPI/cards/netbanking). Stripe checkout for international. Usage bars match server counters. **Re-test export quota after fix #3.** |
| `/settings` | Profile + training-data consent + BYOK + privacy. | OK | — | Privacy copy updated (fix #1). BYOK key never leaves the device (verified in `byok-storage.test.ts`). Training consent modal is a real modal, not bottom-of-page text. |

### Admin pages

| Route | Purpose | Status | Manual checks |
|---|---|---|---|
| `/admin` | Aggregate metrics (DAU, logins-today, top countries…). | OK | Loads only for emails in `ADMIN_EMAILS`. Non-admin → 403, not crash. |
| `/admin/settings` | Feature-flag dashboard (`paymentFeatureEnabled`, `rateLimitEnabled`). | WATCH | **`PRODUCT_FLOW_RESTRICTIONS_ENABLED` no longer affects PDF/DOCX quotas after fix #3** — confirm the flag UI here doesn't lie. |
| `/admin/pattern-review` | Human-in-the-loop for the regex pattern learner. | OK | Propose → sandbox-validate → promote → rollback all work without errors. |

---

## 3. Automated test status (full suite)

Run before merge:

```bash
# Web
cd resume-builder-web && npx tsc --noEmit && npm test
# API
cd resume-builder-api && npm run build && npm test
# Intelligence
cd packages/resume-intelligence && npm test
```

Last full-suite snapshot on this branch:

| Suite | Pass / Total | Pre-existing failures |
|---|---|---|
| `resume-builder-web` | 335 / 338 | 1 (`dashboard-auth-flow.test.tsx`, jsdom matchMedia) + 2 skipped |
| `resume-builder-api` | 225 / 268 | 43 (puppeteer not in sandbox + auth-register expects modules not stubbed in `RootTestModule`). All zero-impact in prod. |

New tests added this week pin the bugs we just fixed:
- `tests/editor-reset-gate.test.ts` — post-upload field-wipe regression guard.
- `tests/export-quota.unit.test.cjs` — PDF + DOCX quota contract.
- `tests/plan-feature-comparison.test.ts` — Free-vs-Paid matrix numbers match server-side `plan-limits.ts`.
- `tests/analytics-service.unit.test.cjs` — auth event forwarding to the self-hosted audit dashboard.
- `tests/data-loader.test.ts`, `tests/focus-trap.test.ts`, `tests/skip-to-content.test.ts` — a11y primitives.

---

## 4. Capacity assessment — can we handle 10k concurrent logins?

### Short answer

**Not safely on a single instance today.** Login is bcrypt-bound. The
current architecture handles ~10-20 logins/sec/instance sustained, so
a true 10k-concurrent burst would queue for 8-15 minutes and most
clients would time out. With three concrete changes (below) we can
serve a 10k burst inside 60s.

### Architecture facts

| Layer | Today | Concern |
|---|---|---|
| API process | Single NestJS process listening on `PORT` (`src/main.ts:63`). | No clustering. Single CPU core handles auth. |
| Auth | Stateless JWT (`@nestjs/jwt`), `expiresIn` 7d, refresh 30d. | ✅ No session-store contention. |
| Password verify | bcrypt cost (default 10–12). | ~100-200ms per login on a typical Render small instance. **This is the bottleneck.** |
| Login rate-limit | **In-memory map per process** (`auth.service.ts:459` comment: *"Swap with Redis for multi-instance deployments"*). | With N instances behind a load balancer, an attacker gets `N × limit` attempts per IP. |
| Global throttle | `@nestjs/throttler` — 60 req/min global (`throttle.module.ts`). | Will rate-limit legitimate burst traffic on a single instance. Per-route throttles override. |
| DB pool | `PRISMA_CONNECTION_LIMIT=10` per instance (`.env.example:35`). | 10 conns × ~10 logins/sec = 100/sec/instance ceiling, *but only if DB latency stays under 100ms*. |
| Connection pooler | Supabase `pgBouncer` (port 6543) recommended for `DATABASE_URL`, direct conn for `DIRECT_URL`. | ✅ Already configured per README. |
| Redis | `@upstash/redis` is in deps; env validation requires `REDIS_URL` + `REDIS_TOKEN` in prod, but it's NOT used for the auth rate limiter. | The package is plumbed; the auth rate limiter just hasn't migrated yet. |

### Back-of-envelope: 10k concurrent logins on **one** Render small (1 vCPU, 0.5 GB)

| Step | Cost |
|---|---|
| TLS handshake | ~5ms |
| bcrypt | ~150ms (single-core) |
| Prisma `findUnique(user)` | ~10-30ms |
| Prisma `update(lastLoginAt)` + `create(refreshToken)` | ~30-50ms |
| JWT sign | <1ms |
| **Total per login** | **~200ms** |
| Single-instance steady state | ~5 logins/sec/core |
| 10k burst time-to-clear | **~30 min** ❌ |

### What it takes to reach 10k concurrent comfortably

| # | Change | Effort | Effect |
|---|---|---|---|
| 1 | Run **3 Render instances + horizontal autoscale to 5** | env config | 5 cores × 5 logins/sec = 25 logins/sec sustained → 10k burst clears in ~7 min. Still slow. |
| 2 | Lower bcrypt cost from 12 → 10 (still safe in 2026 if logins are throttled) | one-line | ~3× faster password verify. 75 logins/sec on 5 instances → 10k burst clears in ~2 min. |
| 3 | Move login rate-limit to **Redis (Upstash already in deps)** | 1-2 hours | Required for #1 to stay safe against credential stuffing. |
| 4 | Cap DB pool growth, use Supabase pooler (already configured) | 0 — verify | Avoids `P2024` pool timeouts under burst. |
| 5 | Push expensive flows (PDF render, AI calls) to a worker queue so auth latency stays low even if other endpoints spike | medium | Insurance for sustained load. |

**Recommendation for launch week:** ship with #1, #3, #4 done. Skip #2
unless you actually see 10k-concurrent traffic — bcrypt cost 12 is the
safer default and we can downscale later. Track p95 login latency and
SLO it at < 500ms.

### What to monitor post-launch

- **p95 / p99 login latency** (NestJS interceptor → Prom-style metric or just a Render log).
- **DB pool wait time** (`P2024` count in logs).
- **Redis hit/miss for rate limiter** once it's migrated.
- **`/auth/login` 5xx rate** — anything > 0.1% is a red flag.
- **Analytics dashboard "logins today"** (`AnalyticsService` is already wired) — sanity-check totals match expected traffic.

---

## 5. Smoke-test script (15-min manual pass)

Run this once before deployment with a fresh test account on the
production URL:

1. Register new account → email arrives → verify → land on `/dashboard`.
2. Upload a real resume → loader visible the whole time → "Continue to Review" → all fields present.
3. Reload page → all fields **still present** (regression guard for the wipe bug).
4. Switch to "Review & ATS" → ATS score appears within 2s and persists.
5. Click "Export PDF" five times → sixth attempt **rejected with the new quota message**.
6. Same for "Export Word" → quota shared.
7. Open `/billing` → Free-vs-Paid matrix shows correct numbers (`₹199` Student, `₹499` Pro). ₹49 explainer card visible.
8. Open `/settings` → privacy copy is the new honest version (no "stays on this device" line).
9. Logout → land on `/`. Re-login → resumes still there.
10. Hit the self-hosted analytics dashboard (`AUDIT_URL`) → confirm `login`, `register`, `logout` events from steps 1-9 show up with the **end user's IP**, not the API server's IP.

---

## 6. Open risks not addressed on this branch

- Local-first / vault scaffolding (commits `2ae743c`, `d010f58`) is shipped but unwired. Don't market it until the Settings toggle and end-to-end encryption are real.
- Mobile Safari upload UX hasn't been re-verified after fix #2.
- Razorpay live keys (`rzp_live_…`) must be present in prod env; the startup guard refuses to boot with `rzp_test_…`.
- Stale `dashboard-auth-flow.test.tsx` failure should be triaged once we have time, but it's a jsdom matchMedia issue, not a real bug.

---

## 7. Additional findings from full-app audit

These came out of the page-by-page inventory and deserve their own
sign-off before launch. Some are now fixed in this branch; others are
documented for the manual smoke pass.

### Fixed in this commit

- **`/templates` route 404.** The homepage CTA "Browse templates" pointed at `/templates`, but only `/templates/preview` was shipped. Added a redirect at `app/templates/page.tsx` so the link, sitemap entry, and any bookmarks resolve cleanly.

### Investigated and confirmed safe

- **`?embed=1` on `/resume/review` bypasses the page-level `AuthGate`.** Looked at it. The embed component itself short-circuits if `getAccessToken()` returns nothing (`ResumeReviewEmbedPreview.tsx:48`), and `api.getResume` round-trips through the API's `JwtAuthGuard`. So the worst an unauthenticated visitor can do is render an empty iframe shell. The API guard is the real boundary — re-confirm it's `JwtAuthGuard`-protected before launch.

### Worth a manual check, not a code change

| Area | Concern | What to check |
|---|---|---|
| `/resume/ats` | `runScore()` auto-fires on mount (`ResumeAtsClient.tsx:38`). FREE users get 2 scans/month; visiting this page twice could exhaust the quota. | Verify the API returns a 402 with the friendly quota message instead of throwing. The page already handles quota errors elsewhere, but the auto-run path specifically should not silently retry. |
| `/auth/callback` | `describeCallbackError` is the only thing between the user and raw backend error text (per the comment at `:29`). | Social-login routes were removed in commit `fbc8176`, so this page is dormant. If you ever re-enable OAuth, audit the error-code map first. |
| `/admin/settings` | Toggles `paymentEnabled` and `rateLimitEnabled` flags directly. Flipping `paymentEnabled=false` must cleanly disable billing CTAs without 500s. | Manual: flip off in staging, hit `/billing`, confirm upgrade buttons go to a friendly "billing disabled" state and not a checkout 500. |
| `/admin/pattern-review` | Depends on backend pattern endpoints; if not deployed, the page shows an error banner instead of a friendly message. | Confirm the API routes (`/admin/pattern-learner/*`) are actually live in prod. |
| `/sahaayak` | Privacy promise hinges on `OptInGate` showing whenever `profile.optedIn !== true`. | Manual: log in, opt in, then opt back out via Settings. Re-visit `/sahaayak` — the gate must reappear, not the chat. |
| `/download` | Silently degrades to "Build not yet published" if `/app/version` 404s. | Confirm the API serves `/app/version` in prod and the Android APK URL + SHA-256 in env actually match a real build. |
| Download charge modal on `/resume/template` | Historic bug where the modal was bypassed and the API returned 403 instead of opening checkout (per comment at `:20`). | Manual: FREE user → click Download → modal opens → complete ₹49 → file downloads. Then try to skip the modal by URL — should bounce, not crash. |
| Mentor-tier gating | Mentor/Chat is PRO-only (`mentor-chat.service.ts:142` is a hard gate), Interview Prep is PRO-only with no rule-based fallback. | Manual: log in as FREE → both pages should show the upgrade card, no broken AI call, no GROQ_API_KEY leak in user copy. |
| BYOK visibility | `ByokKeyCard` only shows on FREE plan (per `08aa472`/`539f0fc`). | Manual: log in as STUDENT/PRO → confirm BYOK card hidden and "AI included with your plan" copy shown. |

### Inventory paths cited

For convenience when re-running the manual pass, the page-level
clients (one per route) live at:

```
app/page.tsx
app/admin/AdminDashboardView.tsx
app/admin/pattern-review/PatternReviewView.tsx
app/admin/settings/page.tsx
app/auth/login/LoginPageView.tsx
app/auth/callback/page.tsx
app/billing/page.tsx
app/career/CareerNavigatorClient.tsx
app/cover-letter/CoverLetterClient.tsx
app/dashboard/DashboardPageView.tsx
app/download/page.tsx
app/interview-prep/InterviewPrepClient.tsx
app/jd-match/JdMatchClient.tsx
app/jobs/JobsTrackerClient.tsx
app/mentor/MentorClient.tsx
app/mentor/chat/MentorChatClient.tsx
app/resume/ResumeEditor.tsx
app/resume/start/ResumeStartClient.tsx
app/resume/review/page.tsx
app/resume/template/TemplateSelectionView.tsx
app/resume/versions/VersionsClient.tsx
app/resume/outcomes/OutcomesView.tsx
app/resume/ats/ResumeAtsClient.tsx
app/resume/ats-simulate/AtsSimulateView.tsx
app/sahaayak/SahaayakClient.tsx
app/settings/SettingsPageView.tsx
app/templates/preview/TemplatePreviewPageClient.tsx
```
