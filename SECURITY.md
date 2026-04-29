# Pocket Resume — Security Model

We distribute Pocket Resume **outside the Apple App Store and Google
Play Store**. That choice avoids store fees and review delays but takes
away three things the stores normally provide:

1. **Integrity guarantees** — stores verify the upload key on every
   install, and re-verify on every auto-update.
2. **Tamper detection** — Play Protect / iOS code signing block
   modified APKs from running.
3. **Auto-updates** — patched builds reach all users within hours.

This document describes how we replace each of those with our own
controls, so a user who downloads from `pocketresume.app/download` is
**at least as safe** as one who installs from a store.

---

## 1. Distribution channels and what protects each

| Channel | Who builds it | How user verifies it | How we patch it |
| --- | --- | --- | --- |
| Android APK on `/download` | EAS Build (cloud, signed with our upload key) | SHA-256 + signing-cert fingerprint published next to the download button | New APK pushed; in-app update prompt drives users to install |
| iOS PWA (Add to Home Screen) | Web build, served over HTTPS | Browser address bar / certificate | Service worker auto-updates within 24h |
| iOS TestFlight | EAS Build → Apple's signed channel | Apple verifies | New TestFlight build; Apple notifies testers |
| Desktop / web browser | Next.js | Browser cert + COOP/COEP isolation | Push to main → Render redeploys |
| (later) Play Store + App Store | Stores | Stores verify | Stores auto-update |

---

## 2. What we built into the code

### 2.1 Mobile client (`resume-builder-mobile`)

| File | Defends against | How |
| --- | --- | --- |
| `lib/security.ts` `biometricGate()` | Lost / shoulder-surfed phone | Face ID / Touch ID / passcode required on every cold start when user opts in (Settings → Biometric app lock) |
| `lib/security.ts` `verifyAppSignature()` | Repackaged, re-signed APK | At startup, compare APK signing-cert SHA-256 to the value baked in at build time. Mismatch → app shows an integrity-error screen and refuses to render |
| `lib/security.ts` `isHostAllowed()` | DNS poisoning / hijacked router | Refuse to send requests to any host outside the configured allow-list |
| `lib/security.ts` `setSecureScreen()` (used in `ResumeEditorScreen`) | Screenshot leaks of resume content | Sets `FLAG_SECURE` on Android, blurs the app preview in iOS app switcher |
| `lib/security.ts` `signRequest()` | Stolen JWT replay with forged body | Every API call carries `X-Request-Signature` = SHA-256 of secret + method + path + timestamp + body; server rejects expired or mismatched signatures |
| `lib/security.ts` `detectCompromisedDevice()` | Rooted/jailbroken environment | Heuristic checks; surfaces a banner so users understand the risk |
| `lib/updateCheck.ts` | Stale, possibly-vulnerable client | Polls `/app/version` on cold start; force-upgrade hard-blocks unsupported versions |
| `expo-secure-store` (used in `lib/api.ts`) | Token theft from app sandbox | JWTs persisted in Keychain (iOS) / EncryptedSharedPreferences (Android) — never in plain JS storage |

### 2.2 Web app / PWA (`resume-builder-web`)

| File | Defends against | How |
| --- | --- | --- |
| `next.config.mjs` | XSS, click-jacking, side-channel leaks | Strict CSP (no inline JS in prod, allow-listed origins), Trusted Types, COOP `same-origin-allow-popups`, CORP `same-site`, `Origin-Agent-Cluster`, full Permissions-Policy denylist, HSTS preload (2y) |
| `public/sw.js` | Stale assets, offline tampering | Versioned cache namespace, network-only for API calls, network-first for navigations, cache-first for static |
| `next.config.mjs` headers for `/sw.js` | Stuck stale workers | `Cache-Control: no-cache, no-store, must-revalidate`, `Service-Worker-Allowed: /` |
| `src/components/PwaInstaller.tsx` | Fake install prompts | Uses the browser's own `beforeinstallprompt` event; we never show a fake "install" outside the OS UI |

### 2.3 Backend (`resume-builder-api`)

| File | Defends against | How |
| --- | --- | --- |
| `src/auth/request-signature.middleware.ts` | Replay / forgery from mobile | Verifies HMAC signatures on every mobile request. Rejects timestamps > 60 s old. Skipped when `REQUEST_SIGNING_KEY` not set (gradual rollout) and for the web client (no `X-App-Platform`) |
| `src/main.ts` `helmet()` | XSS, MIME sniffing, click-jacking on API responses | Strict CSP, HSTS, no Referer, CORP cross-origin |
| `src/main.ts` CORS allow-list | Browser-based exfil from rogue origins | Exact-match + Render preview pattern; rejects everything else |
| `src/auth/*` (existing) | Account takeover | JWT access tokens + rotating refresh tokens, AES-256 token encryption (`TOKEN_ENC_KEY`), per-user rate limits via `@nestjs/throttler` |
| `src/app-meta/app-meta.controller.ts` | Stale clients connecting to current API | Publishes `latest`, `minSupported`, `forceUpgrade` so old/known-bad versions can be cut off server-side without a code deploy |

---

## 3. Operational checklist (what humans must do)

Code alone isn't enough. The list below has to be done by an engineer
with access to deploy secrets.

### 3.1 Generate and store the APK signing key
1. `eas credentials` → choose Android → "Set up a new keystore."
   EAS stores the keystore in your project; **never lose it** — you
   can't ship updates that overwrite an existing install with a
   different signing key.
2. Run `eas credentials` again → "Download credentials" → record:
   - **Keystore SHA-256** (the `signatureSha256` we publish)
   - Keystore password / alias / alias password
   Store these in a password manager. Treat them like prod database
   credentials.

### 3.2 Generate the request-signing key
```bash
openssl rand -hex 32   # 64-char hex string
```
Set the same value in two places:
- API: `REQUEST_SIGNING_KEY` env var (Render dashboard).
- Mobile: `app.json` → `extra.security.requestSigningKey` **or**
  `EXPO_PUBLIC_REQUEST_SIGNING_KEY` env in `eas.json`.
Rotating it requires a new mobile build — that's intentional.

### 3.3 Fill the release manifest after each EAS build
After `eas build --platform android --profile production` finishes,
record these values and set them as Render env vars on the API:

```
APP_LATEST_VERSION=1.2.0
APP_MIN_SUPPORTED_VERSION=1.0.0
APP_FORCE_UPGRADE=false
APP_RELEASED_AT=2026-04-29T10:00:00Z
APP_RELEASE_NOTES=Bug fixes and biometric login
APP_ANDROID_DOWNLOAD_URL=https://downloads.pocketresume.app/pocket-resume-1.2.0.apk
APP_ANDROID_SHA256=<sha256sum of the APK>
APP_ANDROID_SIGNATURE_SHA256=<keystore SHA-256 from 3.1>
APP_ANDROID_SIZE_BYTES=<file size in bytes>
APP_IOS_TESTFLIGHT_URL=https://testflight.apple.com/join/abcdefgh
APP_WEB_URL=https://pocketresume.app
```
Also bake `APP_ANDROID_SIGNATURE_SHA256` into mobile `app.json` →
`extra.security.androidSigningSha256` so the app can self-verify.

### 3.4 Host the APK behind HTTPS with caching that you control
Recommended: a Cloudflare R2 / S3 bucket with public read but signed
upload, and CloudFront / Cloudflare in front of it. **Never** host the
APK on a generic file-share — they can swap files silently.

### 3.5 Configure CSP allow-listed origins
If you move the API to a new domain, update:
- `resume-builder-web/next.config.mjs` `apiUrl` and `connect-src`
- `resume-builder-api` env `CORS_ORIGIN`
- `resume-builder-mobile` `app.json` → `extra.security.pinnedHosts`

### 3.6 Forced upgrades
If a critical CVE forces you to retire a build:
1. Bump `APP_MIN_SUPPORTED_VERSION` to the safe baseline.
2. Set `APP_FORCE_UPGRADE=true`.
3. Push the env change. Within 24h every running app sees the
   force-upgrade dialog on next cold start.

---

## 4. Threat model

| Threat | Likelihood | Impact | Mitigation in this repo |
| --- | --- | --- | --- |
| Attacker re-hosts a tampered APK on a phishing site | Med | Critical | Published SHA-256 + signature; `verifyAppSignature()` blocks unrecognised signers |
| User installs an outdated, vulnerable build | High | High | `/app/version` polling + force-upgrade flag |
| MITM on public Wi-Fi reads / modifies traffic | Med | High | TLS 1.2+ everywhere, CSP `upgrade-insecure-requests`, host allow-list, request signing |
| Phone is lost or shoulder-surfed | High | Med | Biometric gate, `FLAG_SECURE` on resume editor, no token leakage to JS storage |
| Stolen JWT replayed against the API | Low | High | Refresh tokens rotate on use; HMAC request signing on every mobile call |
| Malicious extension injects script into the web app | Med | Med | Strict CSP with Trusted Types, no `unsafe-eval` in prod |
| Malicious site frames our app to phish credentials | Low | High | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `COOP same-origin-allow-popups` |
| Side-channel reads cross-origin data | Low | Med | `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy: same-site`, `Origin-Agent-Cluster: ?1` |
| Service worker hijacks the app shell | Low | High | `Service-Worker-Allowed: /` only at root, no cross-origin SW registration |
| Account takeover via leaked password | Med | Critical | OTP support, refresh-token reuse detection (auth module), strict rate limits |
| Insider modifies a release without anyone noticing | Low | Critical | Release manifest references the signing fingerprint that's also in the running app — divergence is detected on the next launch |

---

## 5. Reporting a vulnerability

Email `security@pocketresume.app` with:
- A short description of the issue.
- Reproduction steps (curl request, screenshot, or proof-of-concept).
- Whether you'd like public credit if we disclose.

We respond within 72 hours and aim to ship a fix within 14 days for
high-severity issues. Please don't open public GitHub issues for
security reports.
