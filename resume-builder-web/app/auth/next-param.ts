/**
 * `?next=` post-auth redirect target — open-redirect guard.
 *
 * Public entry points (template gallery CTAs, marketing pages) may link
 * to /auth/register?next=<path> so a fresh sign-up lands back where the
 * intent was formed instead of on /dashboard. Because the value arrives
 * via the URL it is attacker-controllable, so we only ever accept a
 * same-origin path:
 *
 *   - must start with '/'            → rejects absolute URLs (https://…)
 *   - must not start with '//'       → rejects protocol-relative (//evil.com)
 *   - must not start with '/\'      → browsers normalise backslash to
 *                                       slash, so '/\evil.com' is also
 *                                       protocol-relative in practice
 *
 * Returns the path when safe, or null so callers fall back to /dashboard.
 */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.startsWith('/\\')) return null;
  return value;
}

/** Read + validate the `next` query param from the current URL. */
export function readNextParamFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sanitizeNextPath(new URLSearchParams(window.location.search).get('next'));
  } catch {
    return null;
  }
}
