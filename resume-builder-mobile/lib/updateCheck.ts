/**
 * In-app update prompt for sideloaded distribution.
 *
 * Stores auto-update; we don't get that. So on cold start we ask the
 * server "what's the latest version, and is mine still supported?"
 * The response also carries a SHA-256 hash so the user can verify the
 * download matches what we published.
 *
 * Server contract (see resume-builder-api/src/app-meta):
 *   GET /app/version
 *   200 → {
 *     latest:       "1.2.0",
 *     minSupported: "1.0.0",
 *     android: { url: "...", sha256: "...", signatureSha256: "..." },
 *     ios:     { testflightUrl: "..." },
 *     web:     { url: "https://pocketresume.app" },
 *     forceUpgrade: boolean,
 *     notes: "what changed"
 *   }
 */

import Constants from 'expo-constants';
import { appIdentity } from './security';

export type UpdateInfo = {
  current: string;
  latest: string;
  minSupported: string;
  forceUpgrade: boolean;
  isOutdated: boolean;
  isUnsupported: boolean;
  android?: { url: string; sha256: string; signatureSha256?: string };
  ios?: { testflightUrl: string };
  web?: { url: string };
  notes?: string;
};

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export async function checkForUpdate(apiBase: string): Promise<UpdateInfo | null> {
  const id = appIdentity();
  if (id.platform === 'web') return null; // PWA updates via service worker
  try {
    const res = await fetch(`${apiBase}/app/version?platform=${id.platform}&v=${id.version}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Omit<UpdateInfo, 'current' | 'isOutdated' | 'isUnsupported'>;
    const current = id.version || (Constants.expoConfig?.version ?? '0.0.0');
    const isOutdated = compareSemver(current, data.latest) < 0;
    const isUnsupported = compareSemver(current, data.minSupported) < 0;
    return { ...data, current, isOutdated, isUnsupported };
  } catch {
    return null;
  }
}
