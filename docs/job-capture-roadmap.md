# Job capture & Outcome Loop roadmap

Build plans for the three gaps triaged in
[competitive-analysis-2026.md](competitive-analysis-2026.md). Ordered by
leverage-per-effort, not by size.

---

## 1. Outcome logging nudges (smallest — do first)

**Problem.** The Outcome Loop only produces data if users log responses. Most
won't unprompted, so the differentiator stays theoretical.

**Plan.**
- New cron (reuse the `ats-rb-cron-ops` pattern in render.yaml): daily, find
  `JobApplication` rows in `applied` status with no status change for N days
  (start N=10) whose user has email enabled.
- Send ONE digest email per user per week max: "You applied to {company} with
  {resume title} — any response yet?" with three deep links:
  `/applications?respond={id}&outcome=response|rejected|nothing`.
- The web route pre-opens the application card with the status picker. No new
  UI beyond reading the query param.
- Suppression: per-application `lastNudgedAt` column; never nudge the same
  application twice; global opt-out flag on User.

**Effort.** ~1 day. Schema: 1 column. API: 1 cron endpoint + mail template.
Web: query-param handling on the applications page.

**Success metric.** % of applications that ever reach a terminal status
(response/rejected) — today unknown, target >40%.

---

## 2. ATS identification from job URL (cheap win)

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

Plan 1 and 2 are independent and small — ship both in one release. Plan 3
starts after, so clipped jobs land in a tracker that already nudges for
outcomes and badges the ATS.
