# Subscription audit & monetization model

This is the strategic answer to: *"is the subscription actually
necessary alongside the per-download charge, and what features
should it unlock?"*

The audit was run against the codebase, not from memory.

## What subscription does today (verified, file:line)

| Feature | Free | Student | Pro | Enforced where |
| --- | --- | --- | --- | --- |
| AI Critique (LLM rewrite of summary, skills, bullets) | blocked | unlocked | unlocked | `resume-builder-api/src/ai/ai.service.ts:103` |
| Cover Letter Studio | blocked | unlocked | unlocked | `resume-builder-api/src/ai/cover-letter.service.ts:82` |
| Saved resumes | 2 | 10 | 100 | `resume-builder-api/src/billing/plan-limits.ts` |
| ATS scans / month | 2 | 50 | 300 | `plan-limits.ts:25-28` |
| PDF + Word exports / month | 5 | 25 | 200 | `plan-limits.ts:25-28` |
| AI token budget / month | 8K | 40K | 120K | `plan-limits.ts:25-28` |
| Mentor Mode (role + tech path) | paywalled | unlocked | unlocked | `app/mentor/MentorClient.tsx` |
| Tech Gap analysis (LLM-powered) | rule-based fallback only | LLM | LLM | `ai/tech-gap.service.ts:218` |
| Per-download ₹49 charge | charged | **NOW skipped** (this commit) | **NOW skipped** (this commit) | `billing/download-charge.service.ts` |

The "now skipped" line is the fix shipped with this audit. Before
this change, subscribers were paying ₹399/mo for Student AND ₹49 per
export — the Plan Benefits card promised "no per-download charge for
paid tier" but the code didn't enforce it. That mismatch was
probably a big part of why subscriptions felt empty.

## Three viable monetization models (pick one)

### Model A — Per-download only, no subscription
**How it works:** Charge a fixed ₹49 per export. No tiers, no monthly
bills. AI features are free with rate limits.

| Pros | Cons |
| --- | --- |
| Simplest mental model. Users only pay for output. | Hard to monetise AI: power users get the AI for free. |
| Lowest friction for one-off users (the largest slice). | Revenue ceiling: ~5–10% of users export. |
| No subscription churn to manage. | Can't fund GROQ costs at scale on AI critique. |

**Verdict:** good for v0/MVP, leaves money on the table at scale.

### Model B — Subscription only, no per-download
**How it works:** Free tier has heavy limits (5 exports/mo). Paid
tiers include unlimited (or generous) exports + AI features. No
per-download charge.

| Pros | Cons |
| --- | --- |
| Cleanest mental model: "₹399/mo for everything." | High friction for one-shot users — they don't want to subscribe just to export once. |
| Predictable monthly revenue. | Free tier limits feel artificial; users just sign up with new emails. |
| Easier to budget GROQ costs. | Power users might burn through limits and feel ripped off. |

**Verdict:** great when you have product-market fit. Risky pre-PMF.

### Model C — Hybrid (current, post-fix)
**How it works:**
- Free: ₹49 per download, 2 ATS scans/mo, no AI critique.
- Student ₹399/mo: 25 exports included + AI features + Mentor Mode.
- Pro ₹799/mo: 200 exports included + everything else.

| Pros | Cons |
| --- | --- |
| Captures both casual users (one-off ₹49) and power users (subscribe). | Slightly more complex pricing. |
| Subscribers feel rewarded (no per-export charge). | Free users with multiple downloads pay more than a Student subscription — needs a clear "you'd save by subscribing" nudge. |
| AI features fund themselves: subscription covers GROQ cost. | Two billing flows to maintain. |

**Verdict (recommended):** this is what we have now and it works,
once the bug fixed in this commit lands.

## My recommendation

**Stay on Model C, with these conditions:**

1. **Per-download charge stays on for Free only** — fixed in this
   commit. Students/Pros get exports as part of their plan, capped at
   the monthly limit (`plan-limits.ts`).
2. **Fund AI compute through subscriptions, not per-download.** A
   single GROQ Llama 3.3 70B call costs us roughly ₹0.10–0.50. AI
   critique + tech gap calls add up; the ₹49 download charge doesn't
   cover ongoing AI usage. Subscriptions do.
3. **Make the difference visible.** The Plan Benefits card (shipped
   earlier this branch) is now telling the truth — show it on
   `/dashboard` and `/billing`. After this fix subscribers actually
   skip Razorpay on export, so they'll feel the value.

## What else to add to subscription (priority order)

These are documented in detail in `docs/premium-feature-roadmap.md`.
Short version:

### Ship next month (Student + Pro)
1. **AI Bullet Rewriter** — per-bullet rewrite button. ~2 days. Highest
   weekly engagement of any premium feature in this category.
2. **JD Match Score** — paste a JD, see your match %. ~1 day.
3. **Salary band hints** — static seed data, ₹X – ₹Y per role/level.
   ~1 day.

### Ship next quarter (Pro only — true differentiators)
4. **Interview Prep Cards** — likely questions + outlines from your
   resume. ~3 days.
5. **Mentor Chat** — chat with an AI mentor that has your resume +
   job-tracker history as context. The feature competitors literally
   can't copy without rebuilding our backend. ~5 days.

## So is subscription "necessary"?

**Yes, if you want to scale revenue past ₹50–100/user/month.** A
per-download-only model caps you at the population that actively
exports. Subscription captures recurring revenue from users who
*work on* their resume (multiple iterations, AI rewrites, mentor
guidance) but might only export once or twice.

**No, if you just want to keep the lights on for a few hundred
users.** Per-download alone covers basic costs at small scale.

The way you've described the audience (students, freshers, career
changers in India), the right play is the hybrid. Free gives them
the editor and one-off paid downloads. Paid gives them the AI
guidance to actually improve their resume. Both serve a real need.

## Operational checklist (to make subscription feel real)

- [x] Server skips per-download charge for Student/Pro
      (`download-charge.service.ts:75`).
- [x] Client recognises `included: true` and skips Razorpay modal
      (`DownloadChargeModal.tsx:82`).
- [x] Plan Benefits card on `/dashboard` and `/billing`.
- [x] Plan badge in TopNav.
- [x] Mentor Mode shipped at `/mentor`.
- [ ] **You:** confirm `ENABLE_DOWNLOAD_CHARGE=true` and
      `RAZORPAY_KEY_ID/SECRET` populated on the API service.
- [ ] **You:** smoke-test the full flow end-to-end:
      Free → pays ₹49 → downloads. Student → no Razorpay modal →
      downloads immediately. Pro → same as Student.
- [ ] **You:** decide which of the next-month features (Bullet
      Rewriter / JD Match / Salary bands) to ship first; tell me which.
