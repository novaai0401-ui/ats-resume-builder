# resume-builder-mobile

React Native mobile client for the Resume Builder SaaS.

---

## Prerequisites

| Tool             | Version | Notes                                          |
| ---------------- | ------- | ---------------------------------------------- |
| Node.js          | ≥ 18    | LTS recommended (20.x)                         |
| npm              | ≥ 9     | Ships with Node 18+                            |
| React Native CLI | latest  | `npm install -g react-native`                  |
| **iOS**          |         |                                                |
| Xcode            | ≥ 15    | macOS only; includes iOS Simulator              |
| CocoaPods        | ≥ 1.14  | `sudo gem install cocoapods`                   |
| **Android**      |         |                                                |
| Android Studio   | latest  | Includes Android SDK, emulator, and build tools |
| JDK              | 17      | Required for Android builds                    |

---

## 1. Development Environment (Local)

### 1.1 Install dependencies

```bash
cd resume-builder-mobile
npm install
```

### 1.2 iOS setup (macOS only)

```bash
cd ios && pod install && cd ..
```

> If there is no `ios/` directory yet, run `npx react-native init ResumeBuilder --directory .` to generate native projects, or use Expo.

### 1.3 Android setup

1. Open Android Studio → **SDK Manager**
2. Install Android SDK 34 (or latest)
3. Install Android SDK Build-Tools, Android Emulator, Intel HAXM
4. Create an AVD (Android Virtual Device) via **AVD Manager**
5. Set `ANDROID_HOME` environment variable:

```bash
# ~/.bashrc or ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk       # Linux
export ANDROID_HOME=$HOME/Library/Android/sdk # macOS
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 1.4 Configure API URL

The API base URL is configured in `lib/api.ts`:

| Platform         | URL                                | Why                                        |
| ---------------- | ---------------------------------- | ------------------------------------------ |
| Android emulator | `http://10.0.2.2:3001`            | `10.0.2.2` maps to host machine localhost  |
| iOS simulator    | `http://localhost:3001`            | iOS simulator shares host network          |
| Physical device  | `http://<your-lan-ip>:3001`       | Use your machine's LAN IP (e.g., 192.168.x.x) |

To change the API URL at runtime:

```typescript
import { setApiBase } from './lib/api';
setApiBase('http://192.168.1.100:3001');
```

### 1.5 Start the app

```bash
# Terminal 1 — Start Metro bundler
npm run start

# Terminal 2 — Run on platform
npm run android   # Android emulator/device
npm run ios       # iOS simulator (macOS only)
```

### 1.6 Verify

1. Ensure the API is running at `http://localhost:3001`
2. Open the app — the login screen should appear
3. Register a new account or login with existing credentials
4. If you see network errors, check the API URL configuration (step 1.4)

---

## 2. Staging Environment

### 2.1 Configure API URL

Point the app to your staging API:

```typescript
// lib/api.ts — change the default
let API_BASE = 'https://ats-rb-api-staging.onrender.com';
```

Or call `setApiBase()` at app startup in `App.tsx`:

```typescript
import { setApiBase } from './lib/api';
setApiBase('https://ats-rb-api-staging.onrender.com');
```

### 2.2 Build for staging testing

**Android (debug APK for internal testing):**

```bash
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

**iOS (via Xcode):**

1. Open `ios/ResumeBuilder.xcworkspace` in Xcode
2. Select a development team (signing)
3. Build for a connected device or simulator

### 2.3 Distribute staging builds

- **Android:** Share the debug APK directly, or use Firebase App Distribution
- **iOS:** Use TestFlight via Xcode → Archive → Upload to App Store Connect

---

## 3. Production Environment

### 3.1 Configure production API URL

```typescript
// lib/api.ts
let API_BASE = 'https://api.your-domain.com';
```

### 3.2 Android production build

```bash
cd android

# Generate a release keystore (one-time)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore release.keystore -alias ats-resume \
  -keyalg RSA -keysize 2048 -validity 10000

# Configure signing in android/app/build.gradle:
# signingConfigs {
#   release {
#     storeFile file('release.keystore')
#     storePassword 'your-password'
#     keyAlias 'ats-resume'
#     keyPassword 'your-password'
#   }
# }

# Build signed AAB (for Play Store)
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab

# Or build signed APK (for direct install)
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

**Publish to Google Play Store:**

1. Go to [Google Play Console](https://play.google.com/console)
2. Create a new app
3. Upload the `.aab` file
4. Fill in store listing, content rating, pricing
5. Submit for review

### 3.3 iOS production build

1. Open `ios/ResumeBuilder.xcworkspace` in Xcode
2. Set the **Bundle Identifier** (e.g., `com.yourcompany.resumebuilder`)
3. Select your **Apple Developer Team**
4. Set **Version** and **Build Number**
5. Select **Any iOS Device** as the build target
6. **Product → Archive**
7. In the **Organizer**, click **Distribute App** → **App Store Connect**
8. Upload and submit for review via [App Store Connect](https://appstoreconnect.apple.com)

### 3.4 EAS Build (Expo — alternative)

If you migrate to Expo managed workflow:

```bash
npm install -g eas-cli
eas login

# Create eas.json
cat > eas.json << 'EOF'
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "staging": {
      "distribution": "internal",
      "env": {
        "API_BASE": "https://ats-rb-api-staging.onrender.com"
      }
    },
    "production": {
      "env": {
        "API_BASE": "https://api.your-domain.com"
      }
    }
  }
}
EOF

# Build
eas build --platform android --profile production
eas build --platform ios --profile production

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

---

## Available Scripts

| Script            | Description                              |
| ----------------- | ---------------------------------------- |
| `npm run start`   | Start Metro bundler                      |
| `npm run android` | Build & run on Android emulator/device   |
| `npm run ios`     | Build & run on iOS simulator/device      |

---

## App Screens

| Screen                   | Description                                |
| ------------------------ | ------------------------------------------ |
| `LoginScreen`            | Email/password login + social providers    |
| `DashboardScreen`        | Resume list + template gallery             |
| `ResumeEditorScreen`     | Full resume editor                         |
| `AtsScoreScreen`         | ATS score analysis with suggestions        |
| `TemplateSelectionScreen`| Template preview & selection               |
| `ProfileScreen`          | User profile management                    |

---

## API Configuration

The mobile app communicates with the same backend API used by the web app. All API calls go through `lib/api.ts`.

**Centralized API base URL** is in `lib/api.ts`:
- `getApiBase()` — returns current API URL
- `setApiBase(url)` — updates API URL at runtime

**Key endpoints used:**

| Endpoint                    | Method | Description              |
| --------------------------- | ------ | ------------------------ |
| `/auth/login`               | POST   | Login                    |
| `/auth/register`            | POST   | Register                 |
| `/auth/logout`              | POST   | Logout                   |
| `/auth/social/providers`    | GET    | Social login providers   |
| `/resumes`                  | GET    | List resumes             |
| `/resumes`                  | POST   | Create resume            |
| `/resumes/:id`              | PATCH  | Update resume            |
| `/resumes/:id`              | DELETE | Delete resume            |
| `/resumes/:id/ats-score`    | POST   | Calculate ATS score      |
| `/ai/ai-critique`           | POST   | AI critique              |
| `/ai/tech-gap`              | POST   | Tech gap analysis        |

---

## Troubleshooting

| Issue                                       | Fix                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Network request failed` on Android emulator | Use `http://10.0.2.2:3001` (not `localhost`)                                                |
| `Network request failed` on physical device  | Use your machine's LAN IP; ensure device is on same WiFi                                    |
| Metro bundler port conflict                 | Kill existing Metro process or use `npm run start -- --port 8082`                            |
| iOS build fails with signing error          | Open Xcode → Signing & Capabilities → select your team                                      |
| Android build fails with SDK not found      | Set `ANDROID_HOME` and ensure SDK 34 is installed                                            |
| `@react-native-async-storage` not found     | Run `npm install @react-native-async-storage/async-storage`                                  |
| iOS pods out of date                        | Run `cd ios && pod install --repo-update && cd ..`                                           |
| Stale JS bundle                             | Clear Metro cache: `npm run start -- --reset-cache`                                          |
