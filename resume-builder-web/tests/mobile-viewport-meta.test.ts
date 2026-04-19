import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Mobile viewport + metadata regression test.
 *
 * Without `export const viewport = { width: 'device-width', initialScale: 1 }`
 * a Next.js App Router page renders on mobile at a desktop width and zooms
 * out — the single biggest "my site looks broken on a phone" bug. This test
 * parses the raw source of app/layout.tsx so we don't pull in the full React
 * runtime just to assert these strings.
 */

const layoutSource = readFileSync(
  path.resolve(__dirname, '..', 'app', 'layout.tsx'),
  'utf8',
);

test('layout exports a Next.js viewport with device-width + initialScale 1', () => {
  assert.match(layoutSource, /export const viewport\s*:\s*Viewport\s*=/);
  assert.match(layoutSource, /width:\s*['"]device-width['"]/);
  assert.match(layoutSource, /initialScale:\s*1\b/);
});

test('layout opts into safe-area inset rendering via viewportFit cover', () => {
  // `viewportFit: 'cover'` lets content sit under iOS notches when we
  // opt in per-element with env(safe-area-inset-*).
  assert.match(layoutSource, /viewportFit:\s*['"]cover['"]/);
});

test('layout references the PWA manifest + apple-web-app metadata', () => {
  assert.match(layoutSource, /manifest:\s*['"]\/manifest\.json['"]/);
  assert.match(layoutSource, /appleWebApp:/);
});

test('layout mounts the tekivex-ui base stylesheet before globals', () => {
  // Ordering matters: tekivex-ui tokens must land first so globals.css
  // can override with our brand values.
  const uiIdx = layoutSource.indexOf("'tekivex-ui/styles'");
  const globalsIdx = layoutSource.indexOf("'./globals.css'");
  assert.ok(uiIdx !== -1, 'tekivex-ui/styles import missing');
  assert.ok(globalsIdx !== -1, 'globals.css import missing');
  assert.ok(uiIdx < globalsIdx, 'tekivex-ui/styles must be imported before globals.css');
});

test('layout wraps children in the Providers shell', () => {
  // Providers mounts ThemeProvider / TkxConfigProvider / TkxToastProvider /
  // I18nProvider — missing this is silent-fail on Tkx components.
  assert.match(layoutSource, /<Providers>[\s\S]*\{children\}[\s\S]*<\/Providers>/);
});
