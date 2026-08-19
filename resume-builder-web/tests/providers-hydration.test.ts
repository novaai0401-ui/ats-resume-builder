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
  //
  // Asserted per-component rather than as one source-order regex. The
  // theme providers now live in a ThemedTekivex helper declared ABOVE the
  // Providers export (it needs the resolved light/dark mode from context),
  // so a single regex spanning the whole file encodes declaration order
  // rather than nesting and breaks on any harmless reshuffle.
  const mountedIdx = providersSource.search(/mounted\s*\?/);
  assert.ok(mountedIdx !== -1, 'mounted gate missing');

  // Inspect what the gate actually wraps rather than comparing file offsets.
  // Declaration order is not nesting order — ThemedTekivex is declared above
  // the Providers export, so an offset comparison reports I18nProvider as
  // "inside" the gate when it in fact wraps it.
  const gate = providersSource.slice(mountedIdx, mountedIdx + 240);
  assert.match(gate, /<TkxToastProvider/, 'the mounted gate must wrap TkxToastProvider');
  for (const provider of ['<I18nProvider>', '<ThemeModeProvider>', '<ThemeProvider', '<TkxConfigProvider>']) {
    assert.ok(providersSource.includes(provider), `${provider} missing from Providers`);
    assert.ok(
      !gate.includes(provider),
      `${provider} must render on SSR, not inside the mounted gate`,
    );
  }

  // The outer tree still nests I18n -> ThemeMode -> ThemedTekivex, so locale
  // and the resolved theme are available to everything below.
  assert.match(
    providersSource,
    /<I18nProvider>[\s\S]*<ThemeModeProvider>[\s\S]*<ThemedTekivex>/,
    'I18n must wrap ThemeMode must wrap the tekivex theme layer',
  );
  // ...and inside that layer, ThemeProvider wraps TkxConfigProvider.
  assert.match(
    providersSource,
    /<ThemeProvider[\s\S]*<TkxConfigProvider>/,
    'TkxConfigProvider must sit inside ThemeProvider',
  );
});
