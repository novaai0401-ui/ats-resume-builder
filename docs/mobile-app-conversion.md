# Pocket Resume — Mobile App Conversion Guide

This document describes how the **ATS Resume Builder** web app was extended
into a true cross-platform mobile app, and how to run, build, and deploy
each piece. Same backend, same login, three clients:

```
┌────────────────────────────┐  ┌────────────────────────────┐  ┌────────────────────────────┐
│ resume-builder-web         │  │ resume-builder-mobile      │  │ Mobile PWA (the web app    │
│ Next.js, browsers          │  │ Expo, iOS/Android/Web      │  │ installed from the browser)│
│ + PWA manifest + SW        │  │ EAS Build → App/Play store │  │ uses the same SW + manifest│
└─────────────┬──────────────┘  └─────────────┬──────────────┘  └─────────────┬──────────────┘
              │                                │                                │
              └──────────────► resume-builder-api (NestJS, JWT) ◄───────────────┘
                              shared Postgres user table
```

The user only ever creates one account. Whether they sign in on the web,
the installed PWA, or the native iOS/Android app, they hit the same
`/auth/*` routes and see the same resumes.

---

## 1. What changed in this conversion

### Mobile (`resume-builder-mobile`)

* Migrated from a bare React-Native CLI scaffold to **Expo SDK 51**
  (managed workflow). Expo gives us:
  * One codebase → iOS, Android, and Web.
  * Cloud builds via **EAS Build** (no Mac required for iOS).
  * **EAS Update** for OTA JS-only patches.
  * `expo-secure-store` for Keychain/Keystore-backed JWT storage.
* Wired **React Navigation** (Stack + Bottom Tabs) with deep linking via
  `pocketresume://` and `https://pocketresume.app/*`.
* Added an **AuthContext** with refresh-token rotation against
  `/auth/refresh`. Concurrent 401s share one refresh promise.
* Rebuilt screens to mirror the web app feature set: Dashboard, Resume
  Editor, ATS Score, Templates, Job Tracker, AI Cover Letter, Profile,
  Settings (with an in-app API base override for QA), Forgot Password,
  Register.
* Added `eas.json` with `development` / `preview` / `production` profiles
  and submit configs for the App Store and Play Store.
* `.env.example` documents `EXPO_PUBLIC_API_BASE` / `EXPO_PUBLIC_WEB_URL`
  for the three environments.

### Web (`resume-builder-web`) — PWA upgrade

* Renamed the app to **Pocket Resume** in metadata and the top bar.
* Rewrote `public/manifest.json` to be installable on Android and iOS,
  with shortcuts and `related_applications` pointing at the future store
  listings.
* Added a **service worker** (`public/sw.js`) with cache-first for static
  assets, network-first for navigations, network-only for API calls, and
  an offline fallback page.
* Added `public/offline.html` for the SW fallback.
* Added `src/components/PwaInstaller.tsx` — a non-intrusive bottom banner
  that triggers `beforeinstallprompt` on Android/Chrome and shows the
  iOS Safari "Add to Home Screen" hint. Dismissals are remembered for 7
  days.
* Updated `next.config.mjs` so `/sw.js` is served with `Cache-Control:
  no-cache` (otherwise users get stuck on a stale SW forever).

No backend changes were required — the API was already JWT-based with a
working refresh endpoint.

---

## 2. Running everything locally

You need three terminals.

```bash
# 1. API
cd resume-builder-api
cp .env.example .env       # fill in DATABASE_URL, JWT_SECRET, etc.
npm install
npx prisma migrate deploy
npm run start:dev          # http://localhost:4001

# 2. Web
cd resume-builder-web
echo "NEXT_PUBLIC_API_URL=http://localhost:4001" > .env.local
npm install
npm run dev                # http://localhost:4000

# 3. Mobile
cd resume-builder-mobile
cp .env.example .env       # set EXPO_PUBLIC_API_BASE
npm install
npm start                  # scan QR with Expo Go, or press a (Android) / i (iOS) / w (web)
```

Create an account in the web app, then sign in to the mobile app with the
same email/password — your dashboard appears in both.

---

## 3. Mobile: how to run on a phone

### Easiest: Expo Go

1. Install **Expo Go** on the phone (App Store / Play Store).
2. Make sure the phone and your dev machine are on the same Wi-Fi.
3. From `resume-builder-mobile/`, run `npm start`.
4. Scan the QR code with Expo Go (Android) or the Camera app (iOS).
5. **API URL on a real device must be your LAN IP**, not `localhost`:
   ```
   EXPO_PUBLIC_API_BASE=http://192.168.1.42:4001
   ```
   You can find the LAN IP with `ifconfig` (Mac/Linux) or `ipconfig`
   (Windows). Restart `npm start` after editing `.env`.

### Android emulator

```bash
# Install Android Studio → Tools → AVD Manager → create + start a Pixel device
cd resume-builder-mobile
npm run android
```

The emulator's loopback to host is `10.0.2.2`, which is the default in
`.env.example` so it works with no edits.

### iOS simulator (macOS only)

```bash
xcode-select --install
sudo xcodebuild -license accept
cd resume-builder-mobile
npm run ios
```

### Build a real installable artifact

```bash
# Android APK (sideload)
eas build --platform android --profile preview
# → download the .apk from the EAS dashboard, AirDrop / adb install onto a device.

# iOS .ipa for TestFlight
eas build --platform ios --profile preview
eas submit --platform ios --latest
```

---

## 4. Production deployment

### 4.1 Backend & web — Render (already configured)

`render.yaml` deploys both services:

```bash
git push origin main          # CI runs lint + tests
# Render auto-deploys both services, runs prisma migrate deploy.
```

### 4.2 Mobile — store submissions

```bash
cd resume-builder-mobile

# 1. Build release artifacts in the cloud
eas build --platform all --profile production

# 2. Submit to both stores
eas submit --platform android   # uploads .aab to Google Play (internal track)
eas submit --platform ios       # uploads .ipa to App Store Connect
```

* **Google Play:** in the Play Console, promote `internal` → `closed test`
  → `production` once your testers are happy.
* **App Store:** in App Store Connect, fill the app metadata, submit for
  review. Apple usually responds within 24–48 hours.

### 4.3 Mobile — OTA JS-only patches (skip store review)

```bash
eas update --branch production --message "fix copy on login screen"
```

Users get the new JS bundle on their next cold start. Anything that
touches native code (new permissions, new native modules) still requires
a store rebuild.

### 4.4 Web — installable PWA

Once the web app is deployed, mobile users get a soft mobile app for free:

* **Android Chrome:** the bottom banner appears; tap **Install**.
* **iOS Safari:** tap Share → **Add to Home Screen**.
* **Android Edge / Samsung:** menu → **Install app**.

The installed PWA reads the same JWT cookies/local storage as the
browser, so logging in once is enough.

---

## 5. Environment variable cheat-sheet

| Variable                       | API   | Web  | Mobile | Notes |
| ------------------------------ | :---: | :--: | :----: | ----- |
| `DATABASE_URL`                 |  ✓    |      |        | Postgres pooler URL |
| `DIRECT_URL`                   |  ✓    |      |        | Used by `prisma migrate` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ✓ |      |        | 32+ random bytes each |
| `TOKEN_ENC_KEY`                |  ✓    |      |        | AES-256 for OAuth tokens |
| `NEXT_PUBLIC_API_URL`          |       |  ✓   |        | Build-time, baked into the bundle |
| `EXPO_PUBLIC_API_BASE`         |       |      |   ✓    | Build-time, inlined into JS bundle |
| `EXPO_PUBLIC_WEB_URL`          |       |      |   ✓    | Used for "Open in browser" links |
| OAuth `*_CLIENT_ID/SECRET`     |  ✓    |      |        | Web is a thin client; OAuth runs server-side |
| `OAUTH_REDIRECT_ALLOWLIST`     |  ✓    |      |        | Add `pocketresume://callback` for mobile |

---

## 6. CI/CD recommendation

Add a third workflow to `.github/workflows/`:

```yaml
# .github/workflows/eas-update.yml
name: Mobile OTA update
on:
  push:
    branches: [main]
    paths: ['resume-builder-mobile/**']
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
        working-directory: resume-builder-mobile
      - run: eas update --branch production --message "${{ github.event.head_commit.message }}"
        working-directory: resume-builder-mobile
```

Set `EXPO_TOKEN` in repo secrets (generate at expo.dev → Account
Settings → Access Tokens). Now every merge to `main` ships an OTA update
to all production users.

Store builds (`.aab` / `.ipa`) are still triggered manually with
`eas build --profile production --platform all` since Apple's review
cadence isn't automation-friendly.

---

## 7. Alternative path: wrap the web app with Capacitor

If you'd rather not maintain a second codebase, you can ship the existing
Next.js app as a native shell using **Capacitor**. The trade-off: you
lose offline-first ATS scoring (relies on a webview), and bundle size is
larger. Steps if you choose this path:

```bash
cd resume-builder-web
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/ios @capacitor/android
npx cap init "Pocket Resume" com.pocketresume.app --web-dir=out
npx next build && npx next export    # static export
npx cap add ios
npx cap add android
npx cap copy
npx cap open ios     # build/sign in Xcode
npx cap open android # build/sign in Android Studio
```

This produces a thin iOS/Android shell that loads the exported Next.js
app. Use it for read-heavy products; for our editor + ATS interactivity
the Expo path is the better long-term choice.
