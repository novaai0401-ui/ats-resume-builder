import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Mobile navigation regression tests.
 *
 * We assert the source-level invariants rather than rendering TopNav with
 * the full dep graph (router + api client + session heartbeat + toast
 * provider). The presence checks are enough to catch the most likely
 * regressions: someone removing the burger button, the TkxDrawer, or the
 * CSS that hides the desktop nav on phones.
 */

const webRoot = path.resolve(__dirname, '..');
const topNavSource = readFileSync(
  path.join(webRoot, 'src', 'components', 'TopNav.tsx'),
  'utf8',
);
const globalsCss = readFileSync(path.join(webRoot, 'app', 'globals.css'), 'utf8');

test('TopNav renders a burger button with an accessible label', () => {
  assert.match(topNavSource, /className="nav-burger"/);
  assert.match(topNavSource, /aria-label="Open navigation"/);
  // aria-expanded must be bound so screen readers announce state change.
  assert.match(topNavSource, /aria-expanded=\{drawerOpen\}/);
});

test('TopNav mounts the TkxDrawer with the same link set as the desktop nav', () => {
  assert.match(topNavSource, /<TkxDrawer[\s\S]*isOpen=\{drawerOpen\}/);
  // Single `links` fragment used in both desktop <nav> and drawer <nav>
  // guarantees they never drift.
  const linkUses = topNavSource.match(/\{links\}/g) ?? [];
  assert.ok(
    linkUses.length >= 2,
    `links fragment must be reused in both desktop + drawer (found ${linkUses.length})`,
  );
});

test('TopNav gates the TkxDrawer behind a mounted flag to avoid SSR hydration errors', () => {
  // TkxDrawer renders via portal / touches `document` on mount, which
  // produces markup the client can't match during hydration. We must
  // skip it on the SSR pass. Regression test for the hydration error
  // reported in DevTools: "button → TkxDrawer" mismatch.
  assert.match(topNavSource, /useState\(false\)\s*;?\s*\n[\s\S]*?useEffect\(/);
  assert.match(topNavSource, /\{mounted\s*\?\s*\(\s*\n?\s*<TkxDrawer/);
});

/**
 * Collect every rule body that appears inside a media query matching
 * `condition`. We use this to verify a rule exists inside the correct
 * breakpoint rather than relying on a greedy `[\s\S]*` cross-block
 * regex (which can match across unrelated @media blocks).
 */
function collectRulesIn(css: string, condition: RegExp): string {
  const re = new RegExp(`@media\\s*\\(\\s*${condition.source}\\s*\\)\\s*\\{`, 'g');
  let out = '';
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    out += css.slice(start, i - 1) + '\n';
  }
  return out;
}

test('desktop nav is hidden below 768px and burger is hidden at >=768px', () => {
  const below768 = collectRulesIn(globalsCss, /max-width:\s*767(?:\.98)?px/);
  const above768 = collectRulesIn(globalsCss, /min-width:\s*768px/);
  // Below 768px the desktop nav must disappear and the burger appear.
  assert.match(below768, /\.nav--desktop\s*\{[^}]*display:\s*none/);
  assert.match(below768, /\.nav-burger\s*\{[^}]*display:\s*inline-flex/);
  // Desktop nav (>=768px) keeps the burger out of the way; on desktop the
  // default `.nav-burger { display: none }` rule already handles that, so
  // we simply assert the desktop nav isn't re-hidden at this breakpoint.
  assert.doesNotMatch(above768, /\.nav--desktop\s*\{[^}]*display:\s*none/);
});

test('burger button hits the 44px WCAG touch-target minimum', () => {
  const match = globalsCss.match(/\.nav-burger\s*\{([^}]+)\}/);
  assert.ok(match, '.nav-burger rule missing');
  const body = match[1];
  // Accepts either width/height or min-width/min-height — what matters is
  // the hit area is >= 44px.
  assert.match(body, /(?:min-)?width:\s*44px/);
  assert.match(body, /(?:min-)?height:\s*44px/);
});

test('mobile sticky action bar is pinned with safe-area inset padding', () => {
  // The editor's fixed bottom bar is the core Stage 3 win — it must use
  // env(safe-area-inset-bottom) or iOS home indicator overlaps the buttons.
  const below768 = collectRulesIn(globalsCss, /max-width:\s*767(?:\.98)?px/);
  const barRule = below768.match(/\.mobile-action-bar\s*\{([^}]+)\}/);
  assert.ok(barRule, '.mobile-action-bar rule inside the mobile breakpoint missing');
  const body = barRule[1];
  assert.match(body, /position:\s*fixed/);
  assert.match(body, /env\(safe-area-inset-bottom/);
});

test('mobile action bar defaults to display:none so desktop never sees it', () => {
  // The base (non-media-query) rule hides the bar; the 767px media query
  // flips it on. This guarantees desktop never renders the bar, even if
  // JS mounts the component.
  assert.match(
    globalsCss,
    /\.mobile-action-bar\s*\{\s*display:\s*none;?\s*\}/,
  );
});

// ── R-036 bottom-nav contract ─────────────────────────────────────

test('mobile bottom nav exists and renders the 5 hubs', () => {
  const src = readFileSync(
    path.join(webRoot, 'src', 'components', 'MobileBottomNav.tsx'),
    'utf8',
  );
  // Uses tekivex-ui so it inherits the app's component language.
  assert.match(src, /import\s*\{\s*TkxBottomNav\s*\}\s*from\s*'tekivex-ui'/);
  // Reads the 5-hub config — never duplicate the list, or the bottom
  // nav and TopNav can drift.
  assert.match(src, /NAV_HUBS/);
  assert.match(src, /activeHubKey\(pathname\)/);
});

test('mobile bottom nav is mounted in the root layout', () => {
  const layout = readFileSync(path.join(webRoot, 'app', 'layout.tsx'), 'utf8');
  assert.match(layout, /import\s+MobileBottomNav\s+from/);
  assert.match(layout, /<MobileBottomNav\s*\/>/);
});

test('mobile bottom nav is hidden above 767px and pinned bottom-safe-area below', () => {
  // CSS-only breakpoint — keeps the component media-query-free.
  // Default rule: display:none.
  assert.match(globalsCss, /\.mobile-bottom-nav\s*\{\s*display:\s*none;?\s*\}/);
  // Phone rule: position fixed + safe-area-inset-bottom (iOS home
  // indicator overlap fix, mirrors .mobile-action-bar).
  const below768 = collectRulesIn(globalsCss, /max-width:\s*767(?:\.98)?px/);
  const phoneRule = below768.match(/\.mobile-bottom-nav\s*\{([^}]+)\}/);
  assert.ok(phoneRule, '.mobile-bottom-nav phone rule missing');
  const body = phoneRule[1];
  assert.match(body, /position:\s*fixed/);
  assert.match(body, /bottom:\s*0/);
  assert.match(body, /env\(safe-area-inset-bottom/);
});

test('mobile bottom nav hides for logged-out visitors', () => {
  // No hub navigation makes sense before login — the component
  // returns null until getAccessToken() finds a token.
  const src = readFileSync(
    path.join(webRoot, 'src', 'components', 'MobileBottomNav.tsx'),
    'utf8',
  );
  assert.match(src, /if\s*\(!authed\)\s*return\s*null;?/);
});
