# Premium feature roadmap

The owner asked: *"After paying, what extra features does the user
actually get?"* Answering that needs (a) a clear surface that lists the
benefits — already shipped this branch — and (b) a roadmap of premium
features that earn the price tag. This doc is (b).

## Position in one sentence

Free is a forever-free **resume editor + ATS scorer**. Student/Pro adds
**AI-powered career guidance** — the parts that take a recruiter or
mentor 30 minutes to give you, automated and tailored to your role.

## Already shipped this branch

| Feature | Tier | Surface |
| --- | --- | --- |
| **Plan Benefits card** with concrete bullets | All | `/dashboard`, `/billing` |
| **Plan badge in TopNav** (Free / Student / Pro pill) | All | Every page |
| **Mentor Mode** — pick role + level → tech list, recruiter keywords, free learning resources | Student/Pro | `/mentor` |
| **Salary band hints** — p25 / median / p75 by role + level + city, 8 roles × 9 cities | Pro only | `/mentor` (within the role result) |
| **AI Bullet Rewriter** — per-bullet "✨ Rewrite" returns 3 LLM alternatives, with rule-based fallback | Student/Pro | Editor (next to each experience bullet) |
| **JD Match Score** — paste a JD, get match % + matched/missing keywords + 3 bullets to add | Student/Pro | `/jd-match` |
| **No-double-charge for subscribers** — Student/Pro skip Razorpay on export, exports are part of the plan | Student/Pro | `/billing/download-charge/init` short-circuits |
| **AI Resume Critique** with GROQ Llama 3.3 70B | Student/Pro | Editor → AI Critique button (existing) |
| **Tech Gap Analysis** | Student/Pro | Editor → Tech Gap button (existing) |
| **Cover Letter Studio** with tone control | Student/Pro | `/cover-letter` (existing) |

## Next 30 days (priority order)

### 1. Interview Prep Cards (Pro)
- **What:** From the user's resume + a target role, generate 10 likely
  interview questions with suggested answer outlines.
- **Why:** Every paying user is preparing for interviews. This is the
  highest-leverage extension of what we already know about them.
- **How (rough):**
  - New `/interview-prep` route.
  - New `POST /ai/interview-prep` endpoint that takes the resume +
    role and returns `{ questions: [{ q, why, outline }] }`.
  - Reuse the GROQ provider; same plan-gate as critique.
- **Effort:** ~3 days.

### 2. ~~Salary band hints (Pro)~~ ✅ Shipped
- Implemented at `resume-builder-web/src/lib/salary-bands.ts`.
- 8 roles × 9 cities × 3 levels = 216 combinations, derived from a
  per-(role × level) base table multiplied by per-city multipliers.
- 12 unit tests pin behaviour: ordering, multiplier direction, fallback
  for unknown city, formatInr units (Lakh / Crore), null on unknown role.
- V2 pull from Levels.fyi / AmbitionBox API still pending.

### 3. ~~AI Bullet Rewriter (Student & Pro)~~ ✅ Shipped
- New `BulletRewriterService` at
  `resume-builder-api/src/ai/bullet-rewriter.service.ts`.
- New endpoint `POST /ai/rewrite-bullet` returns 3 alternatives.
- GROQ-driven when `GROQ_API_KEY` is set; rule-based fallback (verb
  swaps) when not — same response shape so the client never branches.
- Per-bullet "✨ Rewrite" button in the editor opens an inline panel
  with 3 alternatives; "Use this" replaces the bullet text and marks
  dirty. Free users see a paywall card pointing at /billing.
- 9 unit tests pin the parser + fallback (`tests/bullet-rewriter.unit.test.cjs`).
- Quotas: ~400 tokens charged per call against the user's monthly
  AI budget.

### 4. ~~Job-Description Match Score (Student & Pro)~~ ✅ Shipped
- New `JdMatchService` at `resume-builder-api/src/ai/jd-match.service.ts`.
- New endpoint `POST /ai/jd-match`. GROQ-driven; rule-based core
  always runs as a baseline so the result is never empty.
- New page `/jd-match` with circular score ring, matched/missing
  keyword chips, and 3 copy-to-clipboard bullet suggestions.
- 13 unit tests pin the rule-based scoring + parser
  (`tests/jd-match.unit.test.cjs`).
- ~600 tokens charged per call.

### 5. Mentor Chat (Pro only — true differentiator)
- **What:** Replace the static role table on `/mentor` with a chat
  interface. User asks "I'm a 3-year frontend dev, should I learn
  React Native or backend next?" — agent answers using their resume +
  job-tracker history as context.
- **Why:** This is the feature competitors *don't* have because most
  aren't built on a resume backend. We have the user's full career
  history; we should put it to work.
- **How:**
  - New `/mentor/chat` route with a streaming chat UI.
  - Server-side: `POST /ai/mentor-chat` with the resume + recent jobs
    + user message. GROQ Llama 3.3 70B with a tight system prompt.
  - Strict rate limit: 20 turns/day on Pro, 5 on Student, 0 on Free.
- **Effort:** ~5 days — biggest item, ship last.

## Backlog (90 days)

| Feature | Tier | Why |
| --- | --- | --- |
| LinkedIn import (paste URL → pre-fill resume) | All | Conversion accelerator. |
| ATS score history graph | Student/Pro | "I went from 45 → 82" is shareable. |
| Recruiter outreach templates | Pro | Pair with Job Tracker. |
| Certification recommendations | Student/Pro | Per-role; tied to Mentor Mode. |
| GitHub repo highlights | Student/Pro | Auto-pull top 5 starred/recent for tech roles. |
| Multi-language resume export | All | Hindi + 4 regional Indian languages. |
| Recruiter shareable links | Pro | One-click "view this resume" link. |
| Application autofill (browser ext) | Pro | Big lift, but huge moat. |

## What we explicitly *don't* do

- **Resume hosting / public profile** — we promised local-first
  privacy. Public profiles violate that.
- **Per-user GROQ keys** — covered in `subscription-mechanics.md`.
- **Blockchain anything** — no.
- **"AI rewrite my entire resume one-click"** — produces generic
  output, hurts the user, hurts our ATS scores. The bullet-level
  rewrite (#3 above) is the right primitive.

## Pricing alignment

Each premium feature should be tagged with the lowest tier that
unlocks it. Right now the split is:

- **Student gets:** AI Critique, Tech Gap, Cover Letter Studio,
  Mentor Mode, AI Bullet Rewriter (when shipped), JD Match Score
  (when shipped).
- **Pro adds:** Interview Prep, Salary bands, Mentor Chat, priority
  rate limits, larger monthly quotas, recruiter outreach templates.

That keeps Student valuable enough at ₹399/mo (it has the AI features
that beat free) and Pro at ₹799/mo justified by depth (chat,
interview prep, larger quotas).

## How we measure success

- **Trial → Paid conversion** within 14 days. Target: 5% of registrants
  upgrade to Student in their first 30 days.
- **Mentor Mode engagement** — % of Student/Pro users who run at least
  one role search per week. Target: 40%.
- **Feature attribution** — when a user upgrades, log the last three
  premium pages they visited as upgrade signal. Mentor Mode should be
  in the top 3 within 60 days.

Once you have those numbers, we know which features to double down on.
