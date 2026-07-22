/**
 * CORS origin allow-listing, extracted from main.ts so it is unit-testable
 * (main.ts runs bootstrap() on import). Three ways an origin is allowed:
 *   1. Exact match against CORS_ORIGIN (comma-separated env).
 *   2. Render preview/PR deploys under a configured *.onrender.com slug.
 *   3. The CallbackCV brand domain tekivex.com and its subdomains over HTTPS
 *      (we own it) — so the production custom domain works even if
 *      CORS_ORIGIN wasn't updated when the domain was attached.
 */

export function parseAllowedOrigins(value?: string): string[] {
  const fromEnv = (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return ['http://localhost:4000', 'http://localhost:4001'];
}

/** Check if an origin is allowed — exact match, Render preview, or brand domain. */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;

  // Allow Render preview/PR deployments matching any configured .onrender.com origin
  // Pattern: <service-name>-<pr-id>.onrender.com or <service-name>-<hash>.onrender.com
  if (allowedOrigins.some((o) => o.endsWith('.onrender.com')) && origin.endsWith('.onrender.com')) {
    for (const allowed of allowedOrigins) {
      try {
        const allowedHost = new URL(allowed).hostname;
        const originHost = new URL(origin).hostname;
        const slug = allowedHost.replace('.onrender.com', '');
        if (originHost === allowedHost || originHost.startsWith(`${slug}-`)) {
          return true;
        }
      } catch { /* skip invalid URLs */ }
    }
  }

  // Always allow the CallbackCV brand domain and its subdomains over HTTPS
  // (e.g. https://callbackcv.tekivex.com). Parsed via URL to avoid substring
  // spoofs like "tekivex.com.evil.com".
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol === 'https:' && (hostname === 'tekivex.com' || hostname.endsWith('.tekivex.com'))) {
      return true;
    }
  } catch { /* not a valid absolute origin — fall through */ }

  return false;
}
