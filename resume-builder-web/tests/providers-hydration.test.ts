import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Regression guard for TkxToastProvider hydration mismatch.
 *
 * TkxToastProvider mounts a portal container (<div aria-label="Notifications">)
 * via useEffect, so its SSR output (one child div) does not match its CSR
 * output (two child divs). React treats that as a hydration mismatch and
 * regenerates the subtree, blowing away component state — including any
 * form input the user typed before hydration finished.
 *
 * We keep I18n / Theme / Config providers on both SSR and CSR (children
 * rely on their contexts) but gate TkxToastProvider behind a `mounted`
 * flag. This test asserts that contract so a future refactor doesn't
 * accidentally put TkxToastProvider back into the SSR render path.
 */

const providersSource = readFileSync(
  path.resolve(__dirname, '..', 'src', 'components', 'Providers.tsx'),
  'utf8',
);

test('Providers is a client component', () => {
  assert.match(providersSource, /^['"]use client['"];/);
});

test('Providers gates TkxToastProvider behind a mounted flag', () => {
  // The core of the fix: mounted starts false, flips true in useEffect.
  assert.match(providersSource, /useState\(false\)/);
  assert.match(providersSource, /useEffect\([\s\S]*?setMounted\(true\)/);
  // TkxToastProvider must appear inside a mounted-conditional render.
  assert.match(providersSource, /mounted\s*\?\s*\(?\s*<TkxToastProvider/);
});

test('Providers keeps Theme/Config/I18n providers rendering on SSR', () => {
  // These provide React context that pages rely on from the first render —
  // they must NOT be gated behind mounted, only the portal-based
  // TkxToastProvider.
  assert.match(providersSource, /<I18nProvider>[\s\S]*<ThemeProvider[\s\S]*<TkxConfigProvider>/);
  // Sanity: the three always-on providers appear before the
  // mounted-conditional block.
  const i18nIdx = providersSource.indexOf('<I18nProvider>');
  const mountedIdx = providersSource.search(/mounted\s*\?/);
  assert.ok(i18nIdx !== -1 && mountedIdx !== -1, 'provider wiring missing');
  assert.ok(i18nIdx < mountedIdx, 'I18n/Theme/Config must wrap the mounted gate');
});
