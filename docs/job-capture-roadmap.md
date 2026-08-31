# Job capture & Outcome Loop roadmap

Build plans for the three gaps triaged in
[competitive-analysis-2026.md](competitive-analysis-2026.md). Ordered by
leverage-per-effort, not by size.

---

## 1. Outcome logging nudges — ✅ ALREADY SHIPPED (R-031)

Correction (2026-08-31): this plan was written before checking the codebase —
the feature exists and is BETTER than planned. `src/outcome-nudge/` sends one
email per stale application (applied >7 days, no status change) with
single-tap signed links (no login needed) for No reply / Rejected /
Interview, an unsubscribe flip on `User.nudgeEmailsEnabled`, an optional
WhatsApp copy (R-087), and an idempotent daily scan driven by the
`ats-rb-cron-nudges` Render cron (09:00 IST). Even inbound-mail replies are
handled.

**Remaining follow-up (small):** surface the metric — % of applications that
ever reach a terminal status — on the admin ops report, so the founder can
see whether nudges are working. Target >40%.

---

## 2. ATS identification from job URL — ✅ SHIPPED 2026-08-31

**Problem.** Jobscan tells users which ATS the employer runs and tailors advice.
We already store `JobApplication.jdUrl` — the ATS is usually IN the hostname.

**Plan.**
- Shared helper `detectAtsFromUrl(url)` in resume-builder-shared:
  hostname/path patterns → `{ ats, label }`:
  - `boards.greenhouse.io`, `greenhouse.io/…/jobs` → greenhouse
  - `myworkdayjobs.com`, `wd\d+.myworkday` → workday
  - `icims.com` → icims
  - `jobs.lever.co` → lever
  - `taleo.net` → taleo
  - `smartrecruiters.com`, `jobvite.com`, `ashbyhq.com`, `bamboohr.com`,
    `workable.com`, `naukri.com` (aggregator — flag as "reposted; original ATS
    unknown"), `linkedin.com/jobs` (same)
- Surface in two places:
  1. Application card: small badge "Employer ATS: Workday".
  2. ATS Simulator: when the linked application has a detected ATS, headline
     the extracted-text view with it ("This is roughly what **Workday** will
     extract") instead of the generic framing. No behavioural change to the
     simulator itself in v1 — honesty first: we detect, we don't yet claim
     engine-specific parse rules.
- v2 (later, optional): per-ATS advice snippets (e.g. Taleo's weaker table
  handling) — only claims we can verify with the simulator itself.

**Effort.** ~half a day + tests (pattern table is the whole feature).

---

## 3. Chrome extension — job clipper (the big one)

**Problem.** Teal's extension is its retention engine. We capture nothing from
where users actually browse jobs (LinkedIn/Naukri/Indeed/company sites).

**Scope (v1 — clipper only, no matching):**
- MV3 extension, one action button: "Save to CallbackCV".
- Content script scrapes title / company / location / JD text from the current
  page. Site-specific extractors for LinkedIn Jobs, Naukri, Indeed; generic
  fallback = page title + selected text + URL.
- POST to a new `POST /applications/clip` endpoint (auth: the existing API-key
  mechanism from ApiAccessCard — no new auth surface; the extension options
  page asks the user to paste their key).
- Creates a `JobApplication` in `wishlist` with `jdUrl` + `jdText` + `source`.
  ATS badge (plan 2) lights up automatically from the URL.
- Server dedupes by (userId, jdUrl).

**Explicitly NOT in v1:** auto-apply, autofill, matching in the popup,
scraping behind logins beyond what the user's own tab already renders.

**Structure.** New top-level `extension/` workspace (plain TS, no framework;
esbuild). Store listing needs: privacy policy URL (exists: /privacy), 128px
icon (derive from icon.svg), 2 screenshots.

**Effort.** ~3–4 days incl. store submission. Chrome Web Store review lead
time ~ days; publish under the Tekivex developer account (one-time $5 fee).

**Success metric.** Clipped applications per weekly active user; % of clipped
applications that later get an outcome logged (feeds plan 1's metric).

---

## Sequencing

Plans 1 and 2 are done (1 predated this doc; 2 shipped with it —
`resume-builder-shared/src/ats-detect.ts` + the tracker's AtsBadge). Next up
is plan 3, the extension: clipped jobs will land in a tracker that already
nudges for outcomes and badges the ATS.
