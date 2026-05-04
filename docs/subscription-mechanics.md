# Subscription mechanics — how the plan tiers actually work

The owner asked: *after a user pays, what do they get, and how does the
system enforce limits automatically?* This doc answers that, files the
"buy a per-user GROQ key" question, and gives the operational checklist
to make subscriptions feel real to the buyer.

## The model in one paragraph

When a user pays via Razorpay, the API stores a `plan` field on their
`User` row (`FREE` / `STUDENT` / `PRO`) and resets their monthly counters
(`atsScansUsed`, `pdfExportsUsed`, `aiTokensUsed`). Every paid feature
checks that field at request time and either lets the call through, or
returns `403 FREE_PLAN_..._LIMIT_EXCEEDED` / similar. Counters bump on
success. The plan is read from the JWT-protected `/billing/status`
endpoint (and cached in `localStorage` as `rb_plan` so the TopNav badge
can render without a round trip).

There is **no per-user API key**. All AI calls go through a single
shared GROQ key on the server. Tier differences are enforced by:

1. **Quota** — how many ATS scans / AI critiques / cover letters / PDF
   exports a user gets per month.
2. **Model selection** — Free uses the rule-based fallback by default.
   Paid tiers route to the GROQ Llama model with a higher per-call
   token budget.
3. **Feature gates** — Tech Gap analysis, premium career guidance, and
   the higher-fidelity resume critique only run on STUDENT/PRO.

This is dramatically cheaper than buying a separate GROQ key per user
(GROQ doesn't sell those anyway) and avoids the operational mess of
tracking which key belongs to which person.

## What each tier unlocks

(These come from `app/billing/page.tsx` — keep this doc in sync if the
plan list changes.)

| Tier | Price (INR) | ATS scans | PDF exports | Saved resumes | AI tokens | AI critique model |
| --- | --- | --- | --- | --- | --- | --- |
| Free | ₹0 | 2 / month | 5 / month | 3 | 2,000 / month | Rule-based fallback (Free GROQ key when configured, else heuristic) |
| Student | ₹4.99/mo (~₹399) | 50 / month | 25 / month | 10 | 8,000 / month | GROQ Llama 3.3 70B |
| Pro | ₹9.99/mo (~₹799) | 300 / month | 200 / month | 100 | 30,000 / month | GROQ Llama 3.3 70B + premium guidance prompt |

Per-download charge (₹49) is **separate** from the subscription and
applies to free users on every export. Paid tiers include exports in
their plan limit, no per-export charge.

## How enforcement actually fires

Each AI / scoring / export route calls a guard like this (real code,
trimmed):

```ts
// resume-builder-api/src/resume/resume.service.ts
const refreshed = await ensureFreePlanFloors(this.prisma, refreshedRaw);
if (productFlowRestrictionsEnabled
    && refreshed.atsScansUsed + 1 > refreshed.atsScansLimit) {
  if (refreshed.plan === 'FREE') {
    throw new ForbiddenException('FREE_PLAN_ATS_LIMIT_EXCEEDED: ...');
  }
  throw new ForbiddenException('ATS scan limit exceeded.');
}
// ... run the operation ...
await this.prisma.user.update({
  where: { id: userId },
  data: { atsScansUsed: refreshed.atsScansUsed + 1 },
});
```

The same shape applies to AI critique, cover letter, tech gap, and PDF
export. So:

- **Counters are server-side.** The client cannot bypass by editing
  state — it'd just get a 403 from the API.
- **Reset is monthly.** `ensureUsagePeriod` rolls the counters when the
  current period (`usagePeriodEnd`) elapses.
- **Plan changes take effect immediately.** When `/billing/upgrade`
  succeeds, the row is updated atomically, so the next API call sees
  the new limits.

## What the user sees

After this branch deploys:

1. **TopNav badge.** Right side of the header shows a coloured pill —
   `Free` (dashed outline), `Student` (green), `Pro` (gradient + ⭐).
   Tapping the badge opens `/billing`. New file:
   `src/components/TopNav.tsx` (`plan` state + badge link).
2. **Billing page** keeps the existing 3-card layout but the success
   message now writes `localStorage.rb_plan` so the TopNav badge
   updates without a refresh.
3. **Feature gates** already exist in the API — no new work there.
   Free users hitting a paid feature get a clear error with the plan
   that's required.

## What you (the owner) need to do operationally

These can't be automated:

1. **Set the GROQ key once.** `GROQ_API_KEY` env on the API service.
   Free tier uses the rule-based fallback when the key is unset, paid
   tiers use the same shared key — pricing on GROQ is generous enough
   that one key serves all users for a long time.
2. **Pick one Razorpay plan.** Currently the upgrade flow uses one-time
   payments. To make subscriptions auto-renew, switch the API's billing
   service to Razorpay Subscriptions (not orders). For v1 stay on
   one-time and prompt the user to renew monthly.
3. **Make sure `/billing/status` returns `plan` correctly.** If a
   user's TopNav badge stays "Free" after paying, two probable causes:
   (a) `/billing/upgrade` didn't update the DB row (Razorpay webhook
   failed), (b) `localStorage.rb_plan` wasn't written. Check
   `app/billing/page.tsx` line 307.
4. **Document plan limits on landing.** Already done in the new
   `/billing` 3-card grid. The home page should also list "what's in
   the free tier" near the hero — already done in commit `3cd0b60`.

## What this is NOT

- **Not** a per-user GROQ API key system. Don't go down that path —
  GROQ doesn't support it, and even if they did, the operational
  burden (key rotation, attribution, abuse handling) outweighs the
  benefit. The previous "bring your own key" form / endpoint /
  Settings UI was removed; users have no way to supply an LLM key,
  by design.
- **Not** a usage-based billing model. We charge a flat monthly tier
  + a flat per-download charge. If you want to shift to usage-based
  later, that needs a separate plan card and a different webhook.
- **Not** a feature flag system. Plan changes are reflected by the
  user-row `plan` column. Feature flags are governed separately by
  `SettingsService`.

## Deferred database cleanup

The Prisma `User.byokKeyEnabled` column still exists in the schema.
We left it in place because dropping a column on a live deployment
breaks any in-flight queries from the previous code version. To
reclaim it cleanly:

1. Wait at least one full deploy cycle after this change ships so
   no in-flight requests reference the column.
2. Generate a Prisma migration that drops `byokKeyEnabled` from
   the `User` model (also remove the field from `prisma/schema.prisma`).
3. `npx prisma migrate dev` locally → review → commit.
4. Deploy. Render's pre-deploy hook runs `prisma migrate deploy`,
   which applies the column drop atomically.

No data loss — the column is a boolean flag that's no longer read
or written.

## Failure modes and what users see

| User scenario | What the system does | What the user sees |
| --- | --- | --- |
| Free user runs 3rd ATS scan in a month | API returns 403 `FREE_PLAN_ATS_LIMIT_EXCEEDED` | Banner: "Free plan allows 2 ATS checks. Upgrade to Student for 50/month." |
| Student user hits 51st scan | API returns 403 `ATS scan limit exceeded.` | Banner: "Limit reached. Upgrade to Pro or wait until reset." |
| Razorpay webhook fails after payment | DB row doesn't update; `localStorage.rb_plan` does | TopNav shows new tier but API rejects paid features. **Fix path:** retry webhook from Razorpay dashboard, or call `/billing/refresh` (manual ticket). |
| User downgrades mid-month | Counters carry over; tier flips on next request | TopNav badge changes immediately; existing scheduled exports still complete. |
| Backend GROQ key is rate-limited | API critique falls back to rule-based engine | "AI provider unavailable. Showing rule-based suggestions." Already handled in `ai.service.ts`. |

## What we tell the user (copy you can paste on /billing)

> **What does the subscription do?**
> Higher monthly limits (more ATS scans, more PDF exports, more saved
> resumes), AI-powered critique with the GROQ Llama 3.3 70B model
> (instead of our rule-based fallback), and Tech Gap analysis tailored
> to your industry. Cancel anytime — no contracts.
>
> **Do I get a private AI key?**
> No. Your subscription gives you priority access to our shared AI
> infrastructure. We pay GROQ for the underlying compute and pass the
> savings on to you.
>
> **What happens if I downgrade?**
> Your saved resumes stay forever. You keep using paid features until
> the end of the billing period, then your monthly limits drop to the
> Free tier on the next reset.
