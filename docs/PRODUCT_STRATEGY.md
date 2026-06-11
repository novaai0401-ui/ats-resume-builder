# Product strategy — how Pocket Resume becomes irreplaceable

Author: Claude (tech-arch / product research pass over the full repo)
Date: 2026-06-11
Status: pre-launch. Nothing in this doc blocks this week's deploy.

---

## 0. The one-paragraph thesis

AI has made resume *writing* free. Within a year, every competitor's core
feature — generate a pretty, ATS-safe resume — is a commodity that any
LLM does in one prompt. The products that survive will not be the ones
that write resumes; they will be the ones that **know which resumes
worked**. Pocket Resume already has, in production code, the one asset
nobody else in this market has bothered to build: a closed loop from
resume version → application → response/interview/offer. That loop is
the moat. Everything below is about feeding it, surfacing it, and
selling it.

---

## 1. What this repo already has that competitors don't

I went through every package. Most "resume builder" repos are an editor
plus templates. This one is quietly much more:

| Asset | Where | Why it matters |
|---|---|---|
| **Outcome Loop** — per-version response/interview/offer rates | `ResumeVersion` + `JobApplication.resumeVersionId` (schema), `/resume/outcomes` | Nobody else attributes outcomes to a specific resume snapshot. Zety/Outspark/Rezi stop at the download. |
| **Apply-click attribution** | `resume-builder-extension/content/job-board.js` | The extension catches the Apply click on job boards and asks "which version did you use?" — the Outcome Loop populates itself. This is the hardest data-collection problem in the space, already solved in code. |
| **Self-improving parser** | `pattern-learner` (ParseFailureSample → LLM-proposed regex → human review → promote) | Parsing failure becomes training data with a human gate. The parser gets better with every bad resume uploaded. |
| **Consented training capture** | `TrainingSample`, patterns-only with PII redaction, real opt-in modal | A legally clean dataset of Indian-market resumes + their parse labels. This is the raw material for a fine-tuned extraction model (Phase 8 already planned: LayoutLMv3/DistilBERT). |
| **Sahaayak** | `/sahaayak`, three modes, crisis resources, loud opt-in | The job hunt is mostly rejection. No competitor acknowledges the emotional reality. This is brand-defining, especially in India. |
| **Sachet pricing** | ₹49/export micro-payment + ₹199/₹499 tiers | Subscription fatigue is real; the pay-per-export option matches how Indian users actually pay (recharge mentality). |
| **BYOK** | free users plug their own Groq/OpenAI key | Cost story + trust story in one. Also future-proof: when users have their own AI subscriptions, we don't fight that — we use it. |
| **Honest-by-default brand** | privacy copy verified against actual data flow; no dark patterns (refused twice in this project's history) | Trust compounds. Every competitor that gets caught lying about "your data stays local" hands us users. |

**Conclusion:** the bones of an irreplaceable product are already here.
The risk is not "missing features" — it's that the moat (Outcome Loop)
is buried as one page among twelve nav items, and the flywheel pieces
(extension ↔ tracker ↔ versions ↔ outcomes) ship as disconnected tools.

---

## 2. The moat, stated precisely: the Outcome Graph

Every resume tool optimizes a **proxy** (ATS score, keyword match,
recruiter "tips"). Pocket Resume can optimize the **ground truth**: did
a human at that company respond?

The flywheel:

```
   create/tailor version ──► apply (extension auto-attributes)
            ▲                          │
            │                          ▼
   "v3 got 2.4× more replies   outcome recorded
    at IT-services companies"  (response / interview / offer)
            ▲                          │
            └──── aggregate, anonymized learning ◄──┘
```

Each turn of the wheel makes the next user's first resume better. After
~10k tracked applications, Pocket Resume can say things nobody else can:

- "Resumes with a 3-line summary get 31% more responses than 8-line ones
  *for QA roles in Pune*." (evidence, not guru advice)
- "This company's ATS rejects tables — your selected template is risky
  *for this specific application*."
- Benchmarks: "median response rate for 4-YOE frontend in Bangalore is
  6%; yours is 11%." (retention + content-marketing gold)

This data cannot be scraped, cannot be prompted out of GPT, and grows
with usage. **That is the definition of a moat in the AI era.**

### What it needs (gap analysis, all small)

1. **Make outcome capture frictionless.** Today the user must visit
   `/resume/outcomes` and log status changes by hand in `/jobs`. Fixes:
   - Extension: when a Gmail/LinkedIn page contains "unfortunately…" or
     an interview invite, offer one-click "log this outcome" (content
     script addition, the plumbing exists).
   - Email-in: forward a rejection/invite to `track@pocketresume.app`,
     we parse and log it (one mail-webhook endpoint).
   - Nudges: 7 days after `status=applied`, one push/email: "any reply
     from Acme? [No reply] [Rejected] [Interview!]" — single tap.
2. **Surface the loop at the moment of choice.** When the user picks a
   template or accepts an AI rewrite, show "versions like this one got
   X% responses" as soon as we have data. Until then, show their own
   version comparison.
3. **Aggregate insights service.** A nightly job over anonymized
   `JobApplication` outcomes producing benchmark stats. Start dumb
   (SQL group-bys), get smart later.

---

## 3. Be AI-native, not AI-resistant ("even an AI will find it helpful")

The founder's instinct is right: AI agents will increasingly *do* the
job hunt. Fighting that loses. The winning position is to become **the
career data layer that agents call**.

### 3.1 MCP server for Pocket Resume (B2C + developer wedge)

Ship a small MCP (Model Context Protocol) server exposing:

- `get_resume(id)` / `list_versions(id)` — structured resume JSON
- `tailor_resume(id, jd_text)` — returns a tailored version AND records
  it as a `ResumeVersion` (so outcomes still attribute)
- `log_application(company, role, version_id)` — writes to the tracker
- `get_outcome_stats(id)` — "which of my versions performs best"

Why this is the smart move: when a user tells Claude/ChatGPT "apply to
these 20 jobs for me," the agent needs a resume source of truth, a
tailoring function, and an application log. If Pocket Resume is the MCP
server it calls, **every agent-driven application still feeds our
Outcome Graph.** Agents become a distribution channel instead of a
threat. Nobody in this market has done this yet; it's a weekend of work
because the REST API already exists.

### 3.2 Portable, signed career profile

Export the structured resume as signed JSON (career-schema). The user
owns it, any tool can read it, but the *history and outcomes* live with
us. Openness on the artifact, gravity on the graph. This also de-risks
the "walled garden" objection institutions will raise (see B2B).

---

## 4. B2B: sell the measurement, not the editor

The genuinely smart B2B insight from this repo: **institutions are
judged on placement outcomes, and this product measures placement
outcomes.** Sell that.

### 4.1 Campus placement cells + bootcamps (the wedge)

Indian colleges and bootcamps (Scaler, Masai, NxtWave, university T&P
cells) live and die by placement rates. They currently have zero
instrumentation between "student has a resume" and "student got
placed." Pocket Resume B2B:

- Cohort licenses (₹99/student/yr — the ₹49 sachet rail already exists
  in billing, this is a bulk SKU on top).
- **Placement-cell dashboard**: cohort ATS-readiness distribution,
  application funnels, response rates per student, intervention flags
  ("these 14 students have applied 30+ times with 0 responses — their
  resumes need review"). The admin analytics module is half of this
  already (`/admin` + `AnalyticsService`).
- The pitch writes itself: "you report placement %; we give you the
  funnel that explains it."

One pilot with 3 colleges in the first 60 days validates this. CAC is
near zero (T&P officers are reachable on LinkedIn), and every student
seat feeds the Outcome Graph — B2B *accelerates* the B2C moat.

### 4.2 Parsing + scoring API (the resume-intelligence package is a product)

`packages/resume-intelligence` is a clean, tested, standalone TypeScript
parser with a self-improvement loop. Job boards, HR tools, and staffing
agencies in India pay for exactly this (most resell RChilli/Affinda at
$0.01–0.05/parse). Expose `POST /v1/parse`, `POST /v1/score`,
`POST /v1/tailor` behind API keys + metered billing. Near-zero marginal
work; pure upside; and every parsed resume is a pattern-learner sample.

### 4.3 Later (don't build now): recruiter-side view

Shareable resume links with view tracking → recruiter analytics →
sourcing product. Out of scope for 90 days; noted so we don't design
ourselves out of it.

---

## 5. What to remove / consolidate (the honest kill list)

Rule I'm applying: **no feature deletions in launch week** — removal is
risk without payoff days before deploy. These are decisions with dates,
not code I've ripped out today.

| Item | Verdict | When |
|---|---|---|
| **Local-first / vault scaffolding** (`2ae743c`, `d010f58`: crypto core, vault endpoints, storage-mode switch — all unwired, no UI) | This already caused one real incident (false "stays on this device" marketing). Either commit to shipping E2E-encrypted resumes as a trust differentiator, or delete the scaffolding. Dead "almost-features" rot. | Decide within 30 days post-launch. My lean: ship it — it pairs perfectly with the honesty brand. |
| **`/mentor` static ROLE_SEEDS** (hand-curated tech/keyword lists for 3 roles × 3 levels) | Hand-curated content goes stale and reads generic next to live AI. Fold into Mentor Chat / Career hub; keep the salary-band data (that's real). | Merge in 60 days. |
| **Nav sprawl: 12 top-level items** (Home, Dashboard, Resume, Versions, Outcomes, ATS Simulator, Jobs, Cover Letter, Career Navigator, Mentor, Sahaayak, JD Match + Settings) | This is the founder's own repeated feedback ("new users can't identify what needs to be done") showing up as information architecture. Twelve doors is a wall. Consolidate to 5: **Home · Resume · Applications** (Jobs + Outcomes + JD Match) **· Coach** (Mentor + Chat + Interview Prep + Career + Sahaayak) **· Account** (Billing + Settings). Routes stay; nav groups. | Design next week, ship within 30 days. Biggest UX win per unit of effort in the whole repo. |
| **`sms-gateway`** (single index.js, appears orphaned) | Confirm dead → archive out of the monorepo. | 30 days. |
| **`resume-builder-ai`** (separate orchestration service, `LLM_PROVIDER=mock` default — the API calls Groq directly and doesn't use it) | Two AI call paths is one too many. Either make it the single AI gateway (good idea at scale: per-tenant keys, caching, fallback chains) or archive it. | Decide at first scale pain; archive if untouched in 90 days. |
| **Hobbies extraction → editor surface** | Parser captures hobbies; the editor barely uses them. Don't expand — hobbies don't move responses. Leave as-is, deprioritize forever. | — |

What I am **not** killing despite the temptation: Sahaayak. On pure
feature-matrix logic it looks like scope creep. It is actually the
brand. Every resume tool is a spreadsheet with fonts; this one knows
the user is a person having a hard month. Keep it, market it.

---

## 6. B2C roadmap — 30/60/90 (post-launch)

**Days 0–30 — close the flywheel**
1. Extension v1 to Chrome Web Store: apply-click attribution + JD
   capture (code exists; needs store listing + auth polish — replace
   paste-your-JWT with a proper token handshake).
2. One-click tailor: JD → tailored version (records a `ResumeVersion`,
   shows a diff against base). Wires JD Match + Versions + AI rewrite
   into one motion. This is the single most-used feature of every
   AI-era competitor (Teal, Careerflow) and we have all the parts.
3. Outcome nudges (the 7-day "any reply?" single-tap email/push).
4. Nav consolidation to 5 hubs.
5. Referral credit: 1 free export per referred signup (sachet rail
   makes this cheap to grant, viral loop for the India market).

**Days 30–60 — distribution + B2B pilot**
6. MCP server (§3.1).
7. Placement-cell pilot: 3 colleges, manual onboarding, the existing
   admin dashboard re-skinned per-cohort.
8. WhatsApp notifications (outcome nudges + Sahaayak check-ins where
   Indian users actually live; Meta Cloud API, templates are cheap).

**Days 60–90 — monetize the graph**
9. Benchmark insights in-product ("your response rate vs. role/city
   median") + one public "State of the Indian Job Hunt" report from
   anonymized aggregates (content marketing that only we can write).
10. Parsing/scoring API beta with metered billing (§4.2).
11. Vault/E2E decision executed (§5).

---

## 7. Why this wins ("GOAT" test)

A product is irreplaceable when each of its three layers reinforces the
others and none can be copied in isolation:

1. **Data layer** — the Outcome Graph. Copying it requires years of
   tracked applications. An LLM cannot hallucinate ground truth.
2. **Workflow layer** — editor + extension + tracker + tailor form a
   loop the user runs daily during a hunt. Single-feature competitors
   (a writer, a tracker, a scorer) each cover one arc of the circle.
3. **Trust layer** — honest privacy copy, loud consent, no dark
   patterns, an emotional companion, sachet pricing. This is the layer
   AI giants structurally can't copy: they monetize the data; we
   visibly don't.

When AI agents arrive, layers 1 and 3 are exactly what they need from a
counterparty: structured truthful career data and a permissioned way to
act on it. The MCP server turns "AI will replace resume builders" into
"AI agents are our highest-volume users."

---

## 8. What this doc deliberately does NOT do

- It does not delete any working code before launch (kill list has
  dates instead — see §5).
- It does not propose blockchain résumés, NFT certificates, or a
  social network. The moat is boring: tracked outcomes, compounding.
- It does not delay the deploy. Ship the smoke-tested branch this week;
  everything here is sequenced after.
