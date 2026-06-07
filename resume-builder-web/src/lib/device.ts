/**
 * Pure device classification from a user-agent + (optional) screen
 * width. Lives outside React so the same logic can be used from a
 * server render guard, a unit test, and a client hook.
 *
 * Why this exists: the "Download App" link in the nav and the
 * download-promo cards make sense only on phones / tablets where
 * installing the native app changes the experience. On a desktop
 * browser the link points at a Play Store / App Store page the user
 * cannot do anything useful with — so we hide it.
 *
 * Strategy: prefer the platform-hint contained in the UA when it is
 * unambiguous (iPhone, iPad, Android Mobile, Android Tablet), then
 * fall back to screen width (>=1024 px → desktop). Anything we can
 * NOT classify defaults to "desktop" so we never accidentally show
 * the install nudge on a desktop browser. Worst case we hide the
 * link on an unusual phone, which is a minor inconvenience compared
 * to confusing a desktop user.
 */

export type DeviceKind = 'mobile' | 'tablet' | 'desktop' | 'unknown';

const MOBILE_UA = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i;
const TABLET_UA = /iPad|Android(?!.*Mobile)|Tablet|Kindle|Silk/i;

export function classifyDevice(
  userAgent: string | null | undefined,
  screenWidth?: number,
): DeviceKind {
  const ua = String(userAgent || '');
  if (!ua) {
    // SSR / very early hydration: don't know yet.
    return 'unknown';
  }
  // Specific UA hints win over the width heuristic — a foldable in
  // tablet mode is still a tablet even if the window is narrow.
  if (MOBILE_UA.test(ua)) return 'mobile';
  if (TABLET_UA.test(ua)) return 'tablet';
  // Fallback to the rendered width. iPadOS 13+ reports a desktop
  // Safari UA, but a portrait iPad sits between 768-1180 px. Treating
  // 1024+ as desktop is the conservative side of that split.
  const w = Number.isFinite(screenWidth) ? Number(screenWidth) : NaN;
  if (Number.isFinite(w)) {
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }
  return 'desktop';
}

export function isInstallTargetDevice(kind: DeviceKind): boolean {
  return kind === 'mobile' || kind === 'tablet';
}
