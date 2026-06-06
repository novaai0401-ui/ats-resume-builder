import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level guardrails for SkipToContent.
 *
 * The skip link is the first focusable element on the page for
 * keyboard users (WCAG 2.4.1 Bypass Blocks). If it ever stops
 * pointing at the main landmark, or loses the focus reveal styles,
 * the bypass is silently broken. These checks pin the contract.
 */

const src = readFileSync(
  path.resolve(__dirname, '..', 'src', 'components', 'SkipToContent.tsx'),
  'utf8',
);

test('default target is the main content wrapper', () => {
  assert.match(src, /targetId\s*=\s*['"]main-content['"]/);
});

test('renders an anchor pointing to the target id', () => {
  assert.match(src, /href=\{?`?#\$\{targetId\}/);
});

test('reveals itself on focus and hides on blur', () => {
  assert.match(src, /onFocus=/);
  assert.match(src, /onBlur=/);
});

test('default style positions link off-screen until focused', () => {
  // Standard "visually hidden" pattern: 1px box pushed far off-screen.
  assert.match(src, /left:\s*'-9999px'/);
  assert.match(src, /width:\s*'1px'/);
  assert.match(src, /height:\s*'1px'/);
});

test('has user-facing copy', () => {
  assert.match(src, /Skip to main content/);
});
