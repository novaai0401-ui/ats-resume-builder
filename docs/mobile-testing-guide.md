# Mobile testing guide — Render-deployed Pocket Resume

End-to-end testing path from "Render deploy is live" to "users can install
and run the app." Read this top-to-bottom on the first pass; come back to
specific sections when something breaks.

## 0. Pre-flight on Render

Before touching any phone, confirm the API and web are healthy and the
new security env vars are set.

```bash
# 1. API smoke test
curl -s https://ats-rb-api.onrender.com/health
# → { "ok": true, "status": "ready" }

# 2. Release manifest endpoint (added in the security commit)
curl -s https://ats-rb-api.onrender.com/app/version?platform=android | jq .

# 3. Web is up + has security headers
curl -sI https://ats-rb-web.onrender.com | head -10

# 4. CORS lets the web app talk to the API
curl -sI -H "Origin: https://ats-rb-web.onrender.com" \
  https://ats-rb-api.onrender.com/health | grep -i access-control
```

### Env vars to set on the API service in Render

| Var | Value | Why |
| --- | --- | --- |
| `CORS_ORIGIN` | `https://ats-rb-web.onrender.com` | Web → API calls |
| `REQUEST_SIGNING_KEY` | _blank initially_ | Turn on later; signed mobile builds need it |
| `APP_LATEST_VERSION` | `1.0.0` | Update checker |
| `APP_MIN_SUPPORTED_VERSION` | `1.0.0` | Force-upgrade floor |
| `APP_FORCE_UPGRADE` | `false` | Kill-switch for old builds |
| `APP_WEB_URL` | `https://ats-rb-web.onrender.com` | Fallback in update dialog |
| `APP_ANDROID_DOWNLOAD_URL` | _blank until first build_ | Set after first EAS build |
| `APP_ANDROID_SHA256` | _blank until first build_ | Set after first EAS build |
| `APP_ANDROID_SIGNATURE_SHA256` | _blank until keystore created_ | Tamper detection |

### Env vars to set on the web service in Render

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://ats-rb-api.onrender.com` |

`NEXT_PUBLIC_*` is build-time, so trigger a manual deploy after changing it.

---

## 1. PWA on phone (5 minutes, no developer account)

Easiest path. Works on any phone, any OS.

### Android (Chrome/Edge/Brave/Samsung)
1. Open `https://ats-rb-web.onrender.com`.
2. Wait ~3 s. The "Install Pocket Resume" banner appears at the bottom.
3. Tap **Install**. Icon lands on the home screen.
4. Tap the icon → full-screen launch, no URL bar.

### iOS (Safari only — Chrome on iOS uses WebKit and won't show the prompt)
1. Open the URL in Safari.
2. Share icon → **Add to Home Screen** → **Add**.

### Verify
- [ ] Sign up with a new account.
- [ ] Create + edit a resume.
- [ ] Enable airplane mode mid-edit → offline page renders, not a crash.
- [ ] Same email/password works on the desktop browser → same resumes.

---

## 2. Expo Go (10 minutes, dev iteration)

Skips the build step; runs the JS bundle inside the Expo Go shell.

```bash
cd resume-builder-mobile
npm install
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_API_BASE=https://ats-rb-api.onrender.com
EXPO_PUBLIC_WEB_URL=https://ats-rb-web.onrender.com
EXPO_PUBLIC_REQUEST_SIGNING_KEY=
```

```bash
npm start
```

Install **Expo Go** on the phone, scan the QR code (Android: in Expo Go;
iOS: in the Camera app). Phone doesn't need to share your Wi-Fi —
`EXPO_PUBLIC_API_BASE` is a public URL.

### Verify
- [ ] Sign in with the account from the PWA test → same resumes show up.
- [ ] Create a new resume on mobile → it appears in the PWA after refresh.
- [ ] Pull-to-refresh on dashboard.
- [ ] Open Resume Editor → try to screenshot. Android blocks; iOS blurs in app switcher.
- [ ] Profile → Settings → toggle **Biometric app lock** + confirm with biometrics.
- [ ] Force-quit, reopen → biometric prompt before app loads.
- [ ] Sign out → login screen.

### Test the update prompt
1. Render: bump `APP_LATEST_VERSION` to `1.1.0`. Save.
2. Cold-start the app on the phone.
3. "Update available" alert appears. Tapping **Update** opens the download URL.
4. Reset to `1.0.0`.

### Test the force-upgrade kill-switch
1. Render: `APP_MIN_SUPPORTED_VERSION=2.0.0` + `APP_FORCE_UPGRADE=true`. Save.
2. Cold-start. Non-cancellable "Update required" dialog.
3. Reset both vars.

---

## 3. Sideloaded APK (30 minutes, Android only — production-like)

This is what real users will install from `/download`.

### Build
```bash
cd resume-builder-mobile
eas login
eas init                # one-time; updates app.json projectId
eas build --platform android --profile preview
```

EAS runs the build in the cloud (~10–15 min). When done, the dashboard
shows:
- Signed `.apk` URL
- **APK SHA-256** (write this down)
- **Signing-cert SHA-256** (write this down — stable across all your future builds)

### Wire the manifest
On Render API service, set:
```
APP_LATEST_VERSION=1.0.0
APP_ANDROID_DOWNLOAD_URL=<EAS URL or your CDN URL>
APP_ANDROID_SHA256=<APK SHA-256>
APP_ANDROID_SIGNATURE_SHA256=<keystore SHA-256>
APP_ANDROID_SIZE_BYTES=<bytes>
```

Update `resume-builder-mobile/app.json`:
```json
"security": {
  "androidSigningSha256": "<keystore SHA-256>"
}
```
Then run `eas build` once more so the running app knows its own expected
fingerprint.

### Install on phone
1. Open `https://ats-rb-web.onrender.com/download` on the phone.
   You should see your APK with the published hash and "Verify your
   download" details.
2. Tap **Download APK**.
3. Open the downloaded file. Android: tap **Settings** → enable "Allow
   from this source" for your browser → back → **Install**.
4. (Optional, on a laptop) verify before installing:
   ```bash
   sha256sum pocket-resume.apk         # must match APP_ANDROID_SHA256
   apksigner verify --print-certs pocket-resume.apk   # must match APP_ANDROID_SIGNATURE_SHA256
   ```

### Verify
- [ ] Same login as PWA works.
- [ ] Render logs show `GET /app/version` on cold start.
- [ ] (Optional) install a debug-signed APK from a different keystore →
      app shows **"App integrity check failed"** screen.

---

## 4. iOS without an Apple Developer account

You're using the **PWA path** (section 1) for iOS. That's fine. PWA on iOS gives:

- Home-screen icon, full-screen launch.
- Shared login.
- Service-worker offline.
- Push notifications since iOS 16.4 (extra setup, not covered here).

You **don't get** biometric app lock, FLAG_SECURE-style screen capture
protection, or native Keychain (uses sandboxed `localStorage` instead).
For most resume-builder users this is acceptable.

If you decide later to do TestFlight: `eas build --platform ios --profile
preview && eas submit --platform ios --latest`. Needs the $99/year
Apple Developer Program.

---

## 5. Turning on HMAC request signing

Do this only **after** sections 1–3 pass.

```bash
# 1. Generate a key
openssl rand -hex 32

# 2. Render API: set REQUEST_SIGNING_KEY to the value, deploy.

# 3. Mobile: paste the SAME value into resume-builder-mobile/.env
EXPO_PUBLIC_REQUEST_SIGNING_KEY=<paste>

# 4. Rebuild
eas build --profile production --platform android
```

### Verify
- [ ] Browser users still work (no header, middleware skips them).
- [ ] New signed APK works on mobile.
- [ ] Old un-signed APK (the previous preview build) starts getting
      `401 Invalid request signature.` — the desired behaviour: old
      compromised builds become inert without removing them from the
      download URL.

---

## 6. End-to-end checklist

Before declaring "deployed":

- [ ] PWA install works on Android Chrome.
- [ ] PWA install works on iOS Safari.
- [ ] Account created in PWA → log in on Expo Go → same data.
- [ ] Edit on mobile → reflected on desktop web.
- [ ] Job tracker CRUD works.
- [ ] AI cover letter generates a result.
- [ ] ATS score returns guidance.
- [ ] Biometric lock blocks reopen after toggle.
- [ ] Screenshot blocked on resume editor.
- [ ] Update prompt fires on version bump.
- [ ] Force-upgrade is non-cancellable.
- [ ] `/download` page shows correct hash and signing fingerprint.
- [ ] `sha256sum` of downloaded APK matches.
- [ ] Tampered APK refused at startup.
- [ ] With `REQUEST_SIGNING_KEY` on: browser still works, signed mobile
      works, un-signed mobile is rejected.

---

## Common things that break

| Symptom | Cause | Fix |
| --- | --- | --- |
| Mobile login `Network request failed` | `EXPO_PUBLIC_API_BASE` points to localhost | Use the public Render URL |
| Web login `CORS error` in console | `CORS_ORIGIN` doesn't include the web origin | Update env var, redeploy API |
| PWA banner never appears on Android | You already dismissed it | Banner is hidden for 7 days; clear `localStorage` |
| iOS PWA doesn't show install option | Using Chrome on iOS | Open in Safari (Apple restriction) |
| `apksigner` says "INSTALLER_PARSE_ERROR" | Wrong keystore | Use the EAS-managed one consistently |
| `/app/version` returns 404 | API not redeployed since security commit | Push branch, wait for Render deploy |
| Update prompt never appears | App version >= `APP_LATEST_VERSION` | Bump the env var on Render |
| Mobile request returns 401 even though user is logged in | `REQUEST_SIGNING_KEY` mismatch | Make sure API and mobile have the **same** value, then rebuild |
| Render web service shows old API URL | `NEXT_PUBLIC_*` is build-time | Manual redeploy after changing the var |
