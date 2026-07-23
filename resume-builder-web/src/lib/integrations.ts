/**
 * Published-integration URLs, env-driven so the UI never shows a dead link
 * (C-003). Both start EMPTY: the Chrome listing URL exists only after Google
 * approves the extension, and the npm page only after `npm publish`. Set the
 * env vars in Render (NEXT_PUBLIC_* = build-time, so trigger a web deploy)
 * once each is live, and every "Get the extension" / "Use in Claude" surface
 * lights up together.
 *
 *   NEXT_PUBLIC_CHROME_EXTENSION_URL
 *     e.g. https://chromewebstore.google.com/detail/bfhjmcohbidaliekjpggjhcmbpmlmnfh
 *   NEXT_PUBLIC_MCP_NPM_URL
 *     e.g. https://www.npmjs.com/package/@tekivex/callbackcv-mcp
 */

export const CHROME_EXTENSION_URL = (process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL || '').trim();
export const MCP_NPM_URL = (process.env.NEXT_PUBLIC_MCP_NPM_URL || '').trim();

export const hasPublishedIntegrations = Boolean(CHROME_EXTENSION_URL || MCP_NPM_URL);
