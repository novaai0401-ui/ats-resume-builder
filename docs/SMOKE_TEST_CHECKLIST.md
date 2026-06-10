# Pre-launch smoke test — fill-in-the-blank checklist

Run end to end on the **production URL** below.
Total time: ~30 min including a fresh signup.

- **Web URL:** `https://ats-rb-web.onrender.com`
- **API URL:** `https://<your-api>.onrender.com` (replace below)
- **Test email:** use a brand-new address (e.g. `you+launchsmoke@gmail.com`) so you can verify the welcome / OTP flow end-to-end.
- **Tester:** ______________________   **Date:** ______________________
- **Build SHA on prod:** ______________________   (Render dashboard → Events)

Tick the box once the step passes. If a step fails, write a one-line note and move on — fix afterwards, don't block the rest of the pass.

---

## Part A — Automated header / endpoint sanity (5 min)

Run from your laptop. Paste the outputs into the result column.
Replace `ATS_URL` first:

```bash
export ATS_URL=https://ats-rb-web.onrender.com
export API_URL=https://YOUR-API.onrender.com    # ← fill in
```

| # | Command | Expected | Pass? |
|---|---|---|---|
| A1 | `curl -sI $ATS_URL/ \| grep -iE "frame-ancestors\|x-frame-options\|strict-transport"` | `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security` present. **Not** `'none'` / `DENY` — that's the bug we just fixed. | ☐ |
| A2 | `curl -sI $ATS_URL/templates` | `301` or `302` redirect to `/templates/preview` (the `/templates` 404 fix). | ☐ |
| A3 | `curl -s $ATS_URL/sitemap.xml \| head -20` | XML body with at least `/`, `/auth/login`, `/templates`. No 5xx. | ☐ |
| A4 | `curl -s $ATS_URL/robots.txt` | `Disallow: /dashboard`, `/resume/`, `/jobs`, `/cover-letter` present. | ☐ |
| A5 | `curl -sI $API_URL/health` (or your health route) | `200 OK`. | ☐ |
| A6 | `curl -s $API_URL/app/version \| head -5` | JSON with `latestVersion` populated — otherwise `/download` will show "Build not yet published". | ☐ |
| A7 | Render dashboard → Logs → search `rzp_test_` | **No matches.** If you see one, the startup guard let a sandbox key through (or the guard isn't enabled). | ☐ |
| A8 | Render dashboard → Env vars | `AUDIT_URL`, `AUDIT_WRITE_KEY`, `RAZORPAY_KEY_ID` (live), `DATABASE_URL` (pooler, port 6543), `DIRECT_URL` (5432), `SMTP_*` all present. | ☐ |

---

## Part B — Manual browser pass (25 min)

Use a clean browser profile (incognito + fresh email). The order matters — later steps depend on the account created in step 1.

### B1. Register a new account

- Open `$ATS_URL/auth/register` → fill name + email + mobile + password → submit.
- Expected: welcome email arrives within 60s, lands on `/dashboard` (or `/auth/login` if email-verify gate is on).
- Email subject seen: ______________________
- ☐ Pass

### B2. Log in

- Either: click the email link, or go to `/auth/login` and sign in.
- Expected: `/dashboard` loads, top nav shows your name, no console errors.
- ☐ Pass

### B3. Upload a real resume

- `/dashboard` → "Start your resume" → `/resume/start` → upload a 1-2 page PDF you actually use.
- Expected during parse: button shows the **inline spinner** + below-button text "Parsing your resume — this usually takes 5–15 seconds. Please keep this tab open." (this is the loader fix from this branch).
- Expected after parse: "Upload processed" panel appears with company count, sections populated, **two buttons** ("Continue to Review" + "Review & ATS").
- Loader visible? ☐   Two buttons present? ☐
- ☐ Pass

### B4. Click "Continue to Review" — field-persistence regression check

- Click the plain "Continue to Review" button. Lands on `/resume?flow=review`.
- Expected: every field populated (contact, summary, skills, experience).
- **Now wait 5 seconds, then hit refresh.**
- Expected: **all fields still there**. (This is the bug we just fixed in `editor-reset-gate`. If fields are blank → critical regression, do NOT ship.)
- Fields after refresh: ☐ Present  ☐ Wiped
- ☐ Pass

### B5. Switch to "Review & ATS" mode

- From the editor, navigate to `/resume/review?id=<your-resume-id>` (or use the nav link).
- Expected: same fields, **plus** the right-hand ATS panel computes a score within ~3s. Section sidebar visible on the left.
- ATS score seen: ______
- ☐ Pass

### B6. Export quota — the headline fix

- `/billing` → confirm "Your current plan: Free".
- Back to editor → click "Export" → modal opens → "Download PDF".
- Repeat **6 times**.
- Expected: first 5 downloads succeed. **6th attempt is rejected** with a message like "Monthly export limit reached (5). Upgrade your plan or wait for next month's reset." (This is the quota enforcement fix. If the 6th succeeds → CRITICAL: the quota check is still bypassed.)
- Downloads 1-5: ☐ all succeeded
- Download 6 blocked with quota message? ☐
- ☐ Pass

### B7. DOCX shares the same counter

- Same editor → "Download Word" once.
- Expected: also rejected (because the quota counter is at 5/5 from step B6). This is the DOCX enforcement fix.
- ☐ Pass

### B8. Billing page — feature matrix + ₹49 explainer

- `/billing` → scroll past plan cards.
- Expected: a **"Free vs Paid — what changes"** table with quotas + features. Below it: a **"What does ₹49 get you?"** card with the per-export explainer. Prices show **₹199 Student / ₹499 Pro** (not the stale 399/799).
- ☐ Matrix visible  ☐ ₹49 explainer visible  ☐ Prices correct
- ☐ Pass

### B9. Privacy copy honest everywhere

- Spot-check three surfaces. None should say "stays on this device" or "Cloud sync is opt-in" — that was the false copy.
  - Homepage hero (`/`) → 🔒 line. Expected: *"HTTPS in transit, encrypted at rest. We never sell your data and never train AI on your resume unless you opt in."*
  - `/resume/start` privacy banner.
  - `/settings` privacy section.
- ☐ All three updated

### B10. Print preview (CSP fix)

- Editor → "Export" → "Print preview".
- Expected: native browser print dialog opens. **Console must be free of `frame-ancestors`-violation errors** — open DevTools first to confirm.
- Console clean? ☐   Print dialog opened? ☐
- ☐ Pass

### B11. Logout / re-login

- Top nav → Logout → land on `/`. Sign back in.
- Expected: dashboard shows the resume you uploaded in B3 (account-scoped persistence, not local-only).
- ☐ Pass

### B12. Analytics dashboard sanity check

- Open the audit dashboard (`AUDIT_URL`).
- Expected: the `register` (B1), `login` (B2 + B11 re-login), and `logout` (B11) events from this session are visible. **The IP attached to each event is YOUR IP**, not the Render server's IP. (This is what proves the XFF forwarding in `AnalyticsService` works.)
- Your IP (from `https://ifconfig.me`): ______________________
- IP shown in dashboard for your test events: ______________________
- ☐ Match

---

## Decision

After the run:

- [ ] **All 12 steps + 8 automated checks PASS → safe to deploy this branch.**
- [ ] One or two non-critical fails → list them in §"Open issues" below and ship if they aren't B4, B6, or B10 (those three are blockers).
- [ ] Any of B4 / B6 / B10 fail → **do not ship.** Open an issue and ping me.

### Open issues found

1. ______________________
2. ______________________
3. ______________________

### Notes for the post-launch follow-up

- Login rate-limit still in-memory (`auth.service.ts:459`) → move to Redis before traffic ramps.
- Local-first / vault scaffolding (`2ae743c`, `d010f58`) shipped but unwired → don't market it yet.
- `/auth/callback` error map dormant (social-login removed) → re-audit if OAuth comes back.
