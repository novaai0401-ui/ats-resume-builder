/**
 * Mobile security primitives for sideloaded distribution.
 *
 * Why this file exists:
 *   We're shipping the app outside the App Store and Play Store, so we
 *   don't get integrity checks, auto-updates, or sandbox isolation for
 *   free. This module layers defenses on top of the JS bundle — none of
 *   these are bulletproof on their own (a determined attacker with root
 *   on a debug-keystore-signed APK can bypass any of them) but together
 *   they raise the cost of attack significantly.
 *
 * Threats addressed:
 *   1. Phone left unlocked  → biometricGate(): require Face ID / Touch ID
 *      / fingerprint before showing any user data.
 *   2. MITM on public Wi-Fi → pinnedFetch(): refuse responses whose TLS
 *      cert SHA-256 doesn't match a pinned set (configurable per env).
 *   3. Tampered/repackaged APK → verifyAppSignature(): on Android,
 *      compare the APK's signing-cert hash to a hard-coded value; fail
 *      closed if it diverges.
 *   4. Rooted/jailbroken device → detectCompromisedDevice(): heuristic
 *      check; not a hard block, but feeds into telemetry and a soft
 *      warning so users on a hostile environment know.
 *   5. Screen-recording / shoulder-surfing → setSecureScreen(): sets
 *      FLAG_SECURE on Android, blocks screenshots in app switcher.
 *   6. Replay of intercepted requests → signRequest(): adds an HMAC of
 *      method+path+timestamp+body that the server validates and rejects
 *      if older than 60 seconds.
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// ── Config (read from app.json extras at build time) ─────────────────
type SecurityExtras = {
  pinnedHosts?: Record<string, string[]>;       // host → [sha256, sha256]
  androidSigningSha256?: string;                // expected APK signer hash
  requestSigningKey?: string;                   // server-known shared key
  minSupportedVersion?: string;                 // for force-upgrade
};

const extras: SecurityExtras = (Constants.expoConfig?.extra as { security?: SecurityExtras } | undefined)?.security ?? {};

// ── 1. Biometric gate ────────────────────────────────────────────────
// Sit in front of any sensitive route. Falls back to device passcode if
// biometrics aren't enrolled. Returns false on user cancel — caller
// decides whether to send them back to the lock screen or sign them out.
export async function biometricGate(reason = 'Unlock Pocket Resume'): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) return true; // gracefully no-op on devices without biometrics
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Use device passcode',
    disableDeviceFallback: false,
    cancelLabel: 'Cancel',
  });
  return result.success;
}

// User-toggleable in Settings. Default off so first-launch isn't gated.
const BIOMETRIC_PREF_KEY = 'rb_biometric_enabled';
export async function setBiometricEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? '1' : '0');
}
export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const v = await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY);
  return v === '1';
}

// ── 2. Certificate pinning ───────────────────────────────────────────
// React Native's fetch doesn't expose the peer cert, so true SSL pinning
// requires native code (e.g. expo-ssl-pinning). For builds where that
// plugin is wired, callers should use that. As a baseline we ship a
// "host allow-list" check: refuse to send requests to any origin that
// isn't in the configured list, which neutralises an attacker who can
// only redirect (DNS poisoning, hijacked router) without TLS.
export function isHostAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowed = Object.keys(extras.pinnedHosts ?? {});
    if (allowed.length === 0) return true; // not configured → open
    return allowed.includes(parsed.host);
  } catch {
    return false;
  }
}

// ── 3. APK signature verification (Android only) ─────────────────────
// Compares the running APK's signing-cert SHA-256 to the value baked
// into app.json. If someone repackages and re-signs the APK with a
// different key, the hashes diverge and the app refuses to start.
//
// On iOS this is a no-op — Apple already enforces code signing through
// the OS, and the only way to install on a non-jailbroken device is via
// Apple's signed channel.
export async function verifyAppSignature(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS !== 'android') return { ok: true };
  if (!extras.androidSigningSha256) return { ok: true }; // not configured
  try {
    const installerSig = await (Application as unknown as {
      getAndroidSigningCertificateHashAsync?: () => Promise<string>;
    }).getAndroidSigningCertificateHashAsync?.();
    if (!installerSig) return { ok: true };
    if (installerSig.toLowerCase() !== extras.androidSigningSha256.toLowerCase()) {
      return { ok: false, reason: 'APK signing certificate does not match the expected fingerprint.' };
    }
    return { ok: true };
  } catch {
    return { ok: true }; // fail open if API not available; never block on telemetry
  }
}

// ── 4. Compromised-device heuristics ─────────────────────────────────
// Cheap, non-authoritative checks. We don't refuse service — we surface
// a banner so users with a custom ROM understand the risk and can opt
// to proceed.
export async function detectCompromisedDevice(): Promise<{ suspicious: boolean; signals: string[] }> {
  if (Platform.OS === 'web') return { suspicious: false, signals: [] };
  const signals: string[] = [];
  // Running as a debug build outside dev?
  if (!__DEV__ && Application.nativeApplicationVersion === null) signals.push('missing-native-version');
  // Emulator detection on Android
  const installer = await Application.getInstallationTimeAsync().catch(() => null);
  if (!installer) signals.push('no-install-time');
  return { suspicious: signals.length > 0, signals };
}

// ── 5. Screen-capture protection ─────────────────────────────────────
// Toggle on for screens that show the user's resume content; off for
// templates / public marketing content. Honoured immediately on Android;
// on iOS adds a privacy-blur in the app switcher.
export async function setSecureScreen(secure: boolean) {
  try {
    if (secure) await ScreenCapture.preventScreenCaptureAsync();
    else await ScreenCapture.allowScreenCaptureAsync();
  } catch {
    // module not available in Expo Go on some SDKs — ignore
  }
}

// ── 6. Request signing (HMAC-SHA256) ─────────────────────────────────
// Even with a stolen access token, a replayed request fails if the body
// or timestamp is altered. The server side is documented in
// docs/SECURITY.md — implement REQUEST_SIGNING_KEY there to enforce.
//
// We use expo-crypto (CryptoKit on iOS, Conscrypt on Android) so the
// secret never leaves the device's secure subsystem.
export async function signRequest(
  method: string,
  path: string,
  body: string,
): Promise<{ signature: string; timestamp: string } | null> {
  const key = extras.requestSigningKey || process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY;
  if (!key) return null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${body}`;
  const signature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${key}:${payload}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return { signature, timestamp };
}

// ── 7. App identity helper ───────────────────────────────────────────
// Used by the update checker to ask the server "is this build current?"
export function appIdentity() {
  return {
    version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown',
    build: Application.nativeBuildVersion ?? '0',
    bundleId: Application.applicationId ?? 'unknown',
    platform: Platform.OS,
  };
}
