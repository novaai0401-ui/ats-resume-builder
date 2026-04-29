# Pocket Resume — Mobile (Expo, React Native)

Cross-platform mobile client for the **ATS Resume Builder** API. One
codebase ships to **iOS, Android, and the Web** because we use Expo +
react-native-web. Users sign in with the **same account** they use on the
web app — both clients call the same JWT-secured backend.

```
resume-builder-mobile/
├── App.tsx                    Navigation shell (Stack + Tabs)
├── lib/
│   ├── api.ts                 fetch client w/ refresh-token rotation
│   ├── AuthContext.tsx        global auth provider
│   └── theme.ts               shared design tokens
├── screens/
│   ├── LoginScreen.tsx        password + social OAuth
│   ├── RegisterScreen.tsx     email + password sign-up
│   ├── ForgotPasswordScreen.tsx
│   ├── DashboardScreen.tsx    list / create resumes
│   ├── ResumeEditorScreen.tsx full editor
│   ├── AtsScoreScreen.tsx     ATS guidance + matched/missing keywords
│   ├── TemplateSelectionScreen.tsx
│   ├── JobTrackerScreen.tsx   Kanban-style job applications
│   ├── CoverLetterScreen.tsx  AI cover letter (premium)
│   ├── ProfileScreen.tsx      account + quick links
│   └── SettingsScreen.tsx     API base override
├── components/
│   └── TemplateCard.tsx
├── app.json                   Expo config (iOS, Android, Web)
├── eas.json                   EAS Build / Submit profiles
├── babel.config.js            babel-preset-expo + reanimated
├── metro.config.js
├── tsconfig.json
└── assets/                    icons + splash (see assets/README.md)
```

---

## 1. Prerequisites

| Tool         | Version | Why                                        |
| ------------ | ------- | ------------------------------------------ |
| Node.js      | 18 LTS  | Same as the web/api packages               |
| npm or pnpm  | latest  | Package manager                            |
| Expo Go app  | latest  | Run on a physical phone in dev (App Store / Play Store) |
| Android Studio | Hedgehog+ | Android emulator (optional)              |
| Xcode        | 15+     | iOS simulator (Mac only, optional)         |
| EAS CLI      | latest  | Cloud builds for the stores                |

```bash
npm i -g eas-cli expo-cli
```

You **don't need** a Mac to build for iOS — EAS Build runs the iOS toolchain
in the cloud.

---

## 2. First-time setup

```bash
cd resume-builder-mobile
npm install
cp .env.example .env
```

Edit `.env` and set:

```
EXPO_PUBLIC_API_BASE=http://10.0.2.2:4001     # Android emulator
# EXPO_PUBLIC_API_BASE=http://localhost:4001  # iOS simulator
# EXPO_PUBLIC_API_BASE=http://192.168.1.x:4001 # physical device on LAN
EXPO_PUBLIC_WEB_URL=http://localhost:4000
```

Make sure the API is running (`cd ../resume-builder-api && npm run start:dev`).

---

## 3. Run the app

### A) Run on a real phone in 30 seconds (recommended)

1. Install **Expo Go** from the App Store / Play Store.
2. From this folder run:
   ```bash
   npm start
   ```
3. A QR code appears in the terminal. Scan it with the Expo Go app
   (Android) or the iPhone Camera app (iOS). The bundler streams the JS
   bundle to the phone.

### B) Android emulator

```bash
# Open Android Studio → AVD Manager → start an emulator first.
npm run android
```

### C) iOS simulator (Mac only)

```bash
npm run ios
```

### D) Run as a web app (yes, the same code)

```bash
npm run web
```

Opens at `http://localhost:19006`. Useful for quick UI checks without a
device.

---

## 4. Authentication is shared with the web app

Both clients call the same backend (`resume-builder-api`):

| Endpoint                         | Used by mobile                     |
| -------------------------------- | ---------------------------------- |
| `POST /auth/login`               | LoginScreen                        |
| `POST /auth/register`            | RegisterScreen                     |
| `POST /auth/forgot-password`     | ForgotPasswordScreen               |
| `POST /auth/refresh`             | API client auto-refresh on 401     |
| `GET  /auth/social/providers`    | Login screen social buttons        |
| `POST /auth/social/:p/callback`  | OAuth deep link via `expo-web-browser` |

JWTs are persisted in **expo-secure-store** on iOS/Android (Keychain /
EncryptedSharedPreferences) and in `localStorage` on the web build. The
fetch wrapper in `lib/api.ts` retries once with a fresh access token on a
401 — concurrent calls share a single refresh promise.

If a user signs in on the phone and later visits the web app, they log in
the same way. If they change their password on the web, the next refresh
on mobile fails and the app sends them back to the Login screen.

---

## 5. Production builds (EAS)

### One-time

```bash
eas login          # log in with the same Expo account that owns the project
eas init           # creates an EAS project, fills app.json `eas.projectId`
```

Edit `eas.json` and replace `you@example.com`, `1234567890`,
`ABCDE12345` under `submit.production.ios` with your Apple credentials.
For Android, drop a Play Store service account JSON at
`secrets/play-service-account.json`.

### Build for internal testing

```bash
# Android: produces an installable .apk
eas build --platform android --profile preview

# iOS: produces an .ipa for TestFlight
eas build --platform ios --profile preview
```

Install the APK directly on a phone. For iOS, distribute the `.ipa` via
TestFlight (`eas submit --platform ios --profile production --latest`).

### Build for the stores

```bash
eas build --platform android --profile production   # .aab → Play Console
eas build --platform ios --profile production       # .ipa → App Store Connect
```

Both run `autoIncrement: true` so the version code bumps automatically.

### Submit to the stores

```bash
eas submit --platform android   # uploads to internal track of Google Play
eas submit --platform ios       # uploads to App Store Connect
```

### OTA updates (no store re-review)

```bash
eas update --branch production --message "fix login crash"
```

Users get the new JS bundle on their next launch. Native modules still
require a store build.

---

## 6. Deep linking & shared sessions

`App.tsx` registers two prefix schemes:

* `pocketresume://` — custom scheme (set in `app.json`)
* `https://pocketresume.app` — universal/app-link domain (claim it on your
  marketing site once the app is in stores)

Routes such as `/resume/:resumeId` and `/cover-letter` work over both.
This is what lets a user tap a link in an email and land directly on the
right screen.

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Network request failed` on Android | You're hitting `localhost`; switch to `http://10.0.2.2:4001` |
| Physical device can't reach the API | Use your machine's LAN IP and make sure the API is bound to `0.0.0.0`, not `127.0.0.1` |
| White screen on web | Run `expo start --web --clear` to nuke the metro cache |
| `Unable to resolve module react-native-reanimated` | Re-run `npm install` and ensure `babel.config.js` has the reanimated plugin **last** |
| Stuck on splash | Check that the API URL in `.env` is reachable from the device's network |
| OAuth opens but doesn't return to the app | Confirm `pocketresume://callback` is in the OAuth provider's allowed redirect URIs **and** in the API's `OAUTH_REDIRECT_ALLOWLIST` env |

---

## 8. Want a "soft" mobile app instead?

The web app is a full **PWA**. Visit the site on a phone, tap the install
banner (Chrome/Edge/Samsung) or Share → Add to Home Screen (Safari iOS).
You get an installable, offline-capable app that uses the same login.
See `resume-builder-web/public/manifest.json` and `public/sw.js`.
