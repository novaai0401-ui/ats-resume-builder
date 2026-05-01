# Analytics & monetization (privacy-respecting)

This doc covers two design decisions: **how we do analytics without
storing user data**, and **how the watermark + paid-download flow gates
monetization**.

## 1. Analytics without storing user content

The product promise — "your resume never leaves your device" — means we
can't pipe user data into a typical "log everything" analytics tool.
But we can still get the metrics we need to run the business.

### What we instrument

Only **counts and durations**, never **content**. Allowed:

| Event | Properties (non-PII) |
| --- | --- |
| `app_opened` | platform (web/ios/android), build version |
| `auth_register_started` / `auth_register_completed` / `auth_register_failed` | failure_reason (enum, e.g. `email_taken`) |
| `auth_login_succeeded` / `auth_login_failed` | failure_reason |
| `resume_created` | template_id |
| `resume_saved` | n/a (no row counts, no field names with content) |
| `template_selected` | template_id |
| `ats_scan_run` | role_level, score_bucket (e.g. "70-79"), had_jd (bool) |
| `cover_letter_generated` | tone, latency_ms |
| `download_initiated` / `download_paid` / `download_completed` | provider (stripe/razorpay), amount, currency |
| `error` | screen, error_code (NEVER message body) |
| `feature_flag_evaluated` | flag_name, value |

**Never instrumented:**
- Resume content (titles, summaries, work history, skills, contact info)
- Job description text (pasted into ATS scoring)
- Cover letter output
- Email addresses (we identify users by a one-way hash of their userId)
- IP addresses (we let the analytics provider geolocate to country, no finer)

### Recommended provider: **PostHog (cloud free tier)**

| Provider | Free tier | Self-hostable | India data residency |
| --- | --- | --- | --- |
| **PostHog** | 1M events/month, 5K session recordings | ✅ (Docker) | EU/US cloud, or self-host in Mumbai |
| **Plausible** | $9/mo or self-host | ✅ | EU cloud |
| **Umami** | self-host only (free) | ✅ | wherever you host |
| Google Analytics | "free" | ❌ | shipped to US, IP collection on by default |
| Mixpanel | 1M events/month | ❌ | US |

For Pocket Resume I recommend **PostHog**:

- 1M events/month is far more than you'll generate at a few thousand
  users.
- Session recording can be turned **off globally** so we never capture
  what's on the screen — important when a user is editing their resume.
- It's GDPR/DPDP-Act compliant when configured with `disable_session_recording`,
  `mask_all_text` (defense in depth), and `respect_dnt`.
- One-line install on web; React Native SDK on mobile.

### How to wire it (later, when you're ready)

```bash
# Web
cd resume-builder-web
npm i posthog-js
```

`src/lib/analytics.ts`:

```ts
import posthog from 'posthog-js';

let initialised = false;
export function initAnalytics() {
  if (initialised || typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return; // off in dev
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: 'https://eu.i.posthog.com',          // or your self-host URL
    capture_pageview: false,                       // we'll fire manually
    disable_session_recording: true,               // never record screen
    respect_dnt: true,
    mask_all_text: true,                           // belt + braces
    autocapture: false,                            // no DOM auto-tracking
    persistence: 'memory',                         // no cookie
  });
  initialised = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialised) return;
  posthog.capture(event, props);
}

export function identify(userIdHash: string) {
  if (!initialised) return;
  posthog.identify(userIdHash);
}
```

For mobile, use `posthog-react-native` with the same flags. Both clients
read the key from `EXPO_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_KEY`
so it can be missing in dev (analytics no-ops).

### Server-side analytics: existing logs are enough

Your NestJS server already logs (via `@nestjs/common` Logger):
- request method + path + status + latency
- userId on authenticated routes
- error stacks

Tail those via Render's log viewer or pipe to **Loki + Grafana**
($0 self-hosted). Don't add another tool until you have a specific
question the logs can't answer.

### Dashboards you actually need before launch

Build these five PostHog insights and call it done:

1. **Daily / weekly active users** (line chart of `app_opened`)
2. **Funnel: register → login → first resume created → first download**
3. **Conversion**: % of users who hit `download_paid`
4. **Retention**: cohort retention of `resume_saved`
5. **Errors**: top 10 `error_code` values by count

Anything beyond these is premature.

## 2. Monetization: the watermark + paid-download flow

### Visual model

```
┌──────────────────────────────────────────────────────┐
│  Free user                                           │
│  ───────────────                                     │
│  Browser preview  → POCKET RESUME watermark visible  │
│  Print (Ctrl+P)   → POCKET RESUME watermark visible  │
│  Screenshot       → POCKET RESUME watermark visible  │
│  PDF download     → BLOCKED (no downloadToken)       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  User pays via Stripe / Razorpay                     │
│  Server issues a per-resume downloadToken (60s TTL)  │
│  ──────────────                                      │
│  PDF download     → CLEAN PDF (server never adds     │
│                     watermark in the export bundle)  │
└──────────────────────────────────────────────────────┘
```

### Implementation, file-by-file

| Surface | File | Behavior |
| --- | --- | --- |
| Web preview frame | `resume-builder-web/src/components/TemplatePreviewFrame.tsx` + `app/globals.css` | `::after` pseudo-element renders an SVG-as-data-URI watermark. Tiles repeat across the page. `@media print` block uses `print-color-adjust: exact` to keep the watermark visible when the user prints. |
| Web "clean" preview (after paid download confirmed, optional) | same | Pass `clean={true}` to `<TemplatePreviewFrame>`. Adds class `template-preview-frame--clean` which hides the `::after`. **Do not set this in any free flow.** |
| Mobile preview | `resume-builder-mobile/components/WatermarkOverlay.tsx` | Tiled `<View>` of `<Text>POCKET RESUME</Text>` rotated -30°. Imported into `TemplateSelectionScreen` and any future preview surface. Honors a `clean` prop (off by default). |
| Mobile screenshot block | `resume-builder-mobile/screens/ResumeEditorScreen.tsx` | `setSecureScreen(true)` already prevents Android screenshots and blurs iOS app switcher. The watermark is the user-facing brand layer; FLAG_SECURE is the OS-level enforcement. |
| Server PDF generation | `resume-builder-api/src/resume/resume.service.ts` `renderResumeTemplateHtml()` | Renders **clean** HTML — no watermark CSS in the export bundle. The route that calls this (`/resumes/:id/pdf`) is gated by `assertDownloadToken`, so reaching the renderer means the user has paid. |
| Download charge | `resume-builder-api/src/billing/download-charge.service.ts` (existing) | Already in place. User pays → server issues a one-time `downloadToken` keyed to `(userId, resumeId)` → next call to `/resumes/:id/pdf?downloadToken=…` succeeds, downloads clean PDF, token is consumed. |

### Why this is hard to bypass

1. **Watermark is in the rendered DOM**, not a separate overlay div the
   user can right-click → inspect → delete. It's a CSS pseudo-element
   on the page container itself. Removing it requires modifying the
   stylesheet, which a non-technical user can't do, and even a
   technical user can only do for their own browser session — they
   can't share a clean version because re-loading the page brings it
   back.
2. **Print uses the same pseudo-element** with stronger opacity, plus
   `print-color-adjust: exact` so the watermark is preserved through
   the print preview into "Save as PDF."
3. **Screenshots include the watermark** because the watermark is part
   of the visible DOM, not a transient overlay.
4. **The "clean PDF" path is server-side** and protected by
   `assertDownloadToken`. There is no free path that produces a clean
   PDF — period. Even the `/resumes/debug/export-html` route is
   guarded by `process.env.NODE_ENV !== 'production'`.
5. **Mobile screenshots are blocked at the OS level** by
   `setSecureScreen(true)` while the editor is open. The watermark is
   belt-and-braces — if a sophisticated user disables the screen-capture
   block via root, they still see the brand on every shot.

### The paid flow (existing — no change needed)

```
Client              Server                 Payment provider
──────              ──────                 ─────────────────
POST /billing/download-charge/init
                    ──────────────────►   create order/intent
                    ◄──────────────────   { orderId, ... }
◄────────────────── { orderId, amount }

(user completes payment in Razorpay/Stripe modal)

POST /billing/download-charge/verify-razorpay
     { orderId, paymentId, signature }
                    verify signature
                    issue downloadToken (60s TTL, in-memory)
◄────────────────── { downloadToken }

GET /resumes/:id/pdf?downloadToken=…
                    assertDownloadToken(token, userId, resumeId)
                    renderResumeTemplateHtml() → puppeteer → PDF
                    consume token
◄────────────────── application/pdf (clean, no watermark)
```

Nothing in this flow changes — your existing code already does it
correctly. The watermark addition affects **only the preview surface**
the user sees before paying.

## 3. What was removed in the simplification pass

To keep the auth surface tight:

- ❌ Google OAuth (login)
- ❌ LinkedIn OAuth
- ❌ Yahoo OAuth
- ❌ GitHub OAuth
- ❌ Google Drive integration (the resume-import-from-Drive flow)
- ❌ OTP-first login UI (kept the OTP service for registration verification + password reset)
- ❌ Upstash Redis dependency (only the Drive session store needed it)

What stays:

- ✅ Email + password login
- ✅ Email OTP for registration verification (existing)
- ✅ Email OTP for password reset (existing `/auth/forgot-password`)
- ✅ JWT access + refresh tokens with rotation
- ✅ Local-first resume storage (default)
- ✅ Optional cloud sync to Supabase
- ✅ Charge-per-download monetization
- ✅ Watermark on every free preview surface

## 4. Render env vars to delete (post-deploy)

After deploying this branch, you can remove these from your Render API
service — nothing in the code reads them anymore:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_OAUTH_SUCCESS_REDIRECT
GOOGLE_LOGIN_CLIENT_ID
GOOGLE_LOGIN_CLIENT_SECRET
GOOGLE_LOGIN_REDIRECT_URI
LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET
LINKEDIN_REDIRECT_URI
YAHOO_CLIENT_ID
YAHOO_CLIENT_SECRET
YAHOO_REDIRECT_URI
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_REDIRECT_URI
SOCIAL_LOGIN_SUCCESS_URL
DRIVE_SESSION_TTL_MS
DRIVE_OAUTH_STATE_TTL_MS
REDIS_URL
REDIS_TOKEN
TOKEN_ENC_KEY
```

Keeping them is harmless but messy. Delete them on your next deploy
window.
