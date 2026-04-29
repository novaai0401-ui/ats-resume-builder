# OTP-first login: migration guide

This repo previously offered four social-login providers (Google,
LinkedIn, Yahoo, GitHub) plus email + password. Google's OAuth platform
is moving to a paid tier, so we cut the social UI and made
**passwordless email OTP** the default login. Existing password users
are not broken — they tap "Use password instead" on the login screen.

## What changed

| Layer | Change | File |
| --- | --- | --- |
| API | `EmailOtpService` is now wired into the auth module and exposed at two endpoints | `resume-builder-api/src/auth/auth.module.ts`, `auth.controller.ts` |
| API | OTP request endpoint now returns a generic ok-message regardless of whether the email exists (anti-enumeration) | `resume-builder-api/src/auth/email-otp.service.ts` |
| Web client | Added `api.requestLoginOtp(email)` and `api.loginWithOtp(email, otp)` | `resume-builder-web/src/lib/api.ts` |
| Web UI | Login page is OTP-first; password is a single-link fallback. Social provider buttons removed | `resume-builder-web/app/auth/login/LoginPageView.tsx` |
| Mobile UI | Same OTP-first redesign | `resume-builder-mobile/screens/LoginScreen.tsx` |
| Mobile client | OTP methods were already present | `resume-builder-mobile/lib/api.ts` |

The social-login backend routes (`/auth/social/*`) are still mounted —
users who already linked their Google account are not orphaned, they
just sign in with OTP from now on. You can delete those routes later
once telemetry shows nobody hits them.

## The two endpoints

```
POST /auth/request-otp
Content-Type: application/json
{ "email": "user@example.com" }
→ 200 { "ok": true, "message": "If an account exists for that email, a verification code has been sent." }
```

Always returns the same shape. Internally:
- 6-digit code, bcrypt-hashed before storage.
- 10-minute expiry.
- 60-second resend cooldown.
- 5-attempt brute-force lockout for 10 minutes.
- Rate limits: 5 sends per email per hour, 20 per IP per hour.

```
POST /auth/verify-otp
Content-Type: application/json
{ "email": "user@example.com", "otp": "123456" }
→ 200 { "accessToken": "...", "refreshToken": "...", "user": {...} }
```

Same response shape as `/auth/login`, so client session handling is
identical regardless of which method ran.

## Email provider options (Google-OAuth-free)

The OTP service uses your existing `MailService` (`SMTP_*` env vars).
All of these work with no Google-paid dependency:

| Provider | Free tier | Setup cost | Notes |
| --- | --- | --- | --- |
| **Resend** | 3,000 / month, 100 / day | 5 min | Modern API, generous free tier, deliverability is good. **Recommended.** |
| **AWS SES** | 62,000 / month if sent from EC2; otherwise $0.10 per 1,000 | ~30 min | Cheapest at scale. Sandbox-locked until you request production access. |
| **SendGrid** | 100 / day forever | 10 min | Reliable, but free tier is small. |
| **Mailgun** | 100 / day for 30 days then paid | 10 min | Trial only — skip unless you'll pay anyway. |
| **Postmark** | 100 / month free trial | 10 min | Best deliverability for transactional, but tiny free tier. |
| **Self-hosted Postfix** | unlimited | hours | Don't. Modern inbox providers will silent-drop you. |
| **Gmail SMTP (app password)** | ~500 / day | 5 min | Fine for dev, terrible idea in prod (Google can revoke any time). |

### Recommended: Resend (Render-friendly)

```bash
# 1. Sign up at https://resend.com → verify your sending domain.
# 2. Generate an API key.
# 3. Set on Render API service:
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=re_yourapikey
SMTP_FROM="Pocket Resume <noreply@your-domain.com>"
```

Resend gives you 3,000 emails/month free, which is enough for ~100
daily-active users. When you outgrow it, switch to AWS SES (`smtp_user`
+ `smtp_password` from the IAM SES user) — same `SMTP_*` keys, ~10×
cheaper at scale.

### Verify the SMTP wiring

```bash
curl -X POST https://ats-rb-api.onrender.com/auth/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@your-test-account.com"}'
# → { "ok": true, "message": "If an account exists..." }
```

Check the inbox. If nothing arrives:
1. Render API logs will say `SMTP not configured` if env vars are
   missing — fix and redeploy.
2. They'll say `Failed to send verification email` if SMTP is configured
   but rejected — usually wrong password or unverified sending domain.
3. If logs say everything sent fine but no email lands, check spam,
   and verify your sending domain has SPF + DKIM records (your provider
   shows these after domain verification).

## Security model

Already covered in the existing service; recapped here for completeness:

- **OTP storage**: bcrypt with cost factor 12. We never store the plain
  code, even briefly.
- **User enumeration**: same response whether the email exists or not.
  Even rate-limit consumption is similar across both branches.
- **Replay**: each code can only be verified once; on success we delete
  every challenge for that email.
- **Brute force**: 5 wrong attempts → 10-minute lockout. Independent of
  the per-email and per-IP rate limits.
- **Token leakage**: tokens land via the same `/auth/verify-otp`
  response and flow into the same secure storage that password login
  uses (Keychain / Keystore on mobile, httpOnly cookie on web).

## Operational checklist

- [ ] Render API: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
      `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- [ ] Verify sending domain (SPF + DKIM at your DNS provider).
- [ ] Test `POST /auth/request-otp` from curl, confirm an email lands.
- [ ] Test `POST /auth/verify-otp` returns valid tokens.
- [ ] Sign in via the web UI: OTP path works.
- [ ] Sign in via the mobile UI: OTP path works.
- [ ] Existing password user can still sign in via "Use password instead."
- [ ] Disable the social provider env vars on Render (optional; the
      buttons are gone from the UI anyway). Keeps your secret hygiene
      clean.

## Removing social OAuth completely (later, optional)

Once you're confident no one is using the social-login routes:

1. Delete `resume-builder-api/src/auth/social-auth.controller.ts` +
   `.service.ts` and remove from `auth.module.ts`.
2. Drop OAuth columns from `User` table (`googleId`, `linkedinId`, …)
   via a Prisma migration.
3. Remove `getSocialProviders` from both API clients.
4. Delete the `OAUTH_*`, `GOOGLE_CLIENT_*`, `LINKEDIN_*`, `YAHOO_*`,
   `GITHUB_*` env vars from Render.

Don't do step 2 without first running an analytics query like
`SELECT count(*) FROM "User" WHERE "googleId" IS NOT NULL` so you know
how many accounts are affected. Anyone with only a `googleId` and no
password will need to use the OTP flow to recover their account — the
flow already works because it keys on email, not OAuth identity.
