import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level guardrails for the shared DataLoader component.
 *
 * DataLoader is the one loading surface every data-fetching page uses,
 * so its accessibility contract has to be locked down: role="status",
 * aria-busy, aria-live, and prefers-reduced-motion support. These tests
 * pin those at the source level so a future refactor cannot regress
 * them without flagging.
 */

const src = readFileSync(
  path.resolve(__dirname, '..', 'src', 'components', 'DataLoader.tsx'),
  'utf8',
);

test('exports DataLoader as default', () => {
  assert.match(src, /export default function DataLoader/);
});

test('every render branch sets role="status"', () => {
  const matches = src.match(/role="status"/g) ?? [];
  // Three modes: block, inline, skeleton.
  assert.ok(matches.length >= 3, `expected >= 3 role="status" usages, got ${matches.length}`);
});

test('every render branch sets aria-busy="true"', () => {
  const matches = src.match(/aria-busy="true"/g) ?? [];
  assert.ok(matches.length >= 3, `expected >= 3 aria-busy="true" usages, got ${matches.length}`);
});

test('every render branch sets aria-live="polite"', () => {
  const matches = src.match(/aria-live="polite"/g) ?? [];
  assert.ok(matches.length >= 3, `expected >= 3 aria-live="polite" usages, got ${matches.length}`);
});

test('honours prefers-reduced-motion', () => {
  assert.match(src, /prefers-reduced-motion/);
});

test('exports SkeletonBar helper for shape-preserving placeholders', () => {
  assert.match(src, /export function SkeletonBar/);
});

test('skeleton mode renders the caller-supplied skeleton node', () => {
  // The skeleton branch should reference {skeleton} so callers' content shows.
  assert.match(src, /mode === 'skeleton'/);
  assert.match(src, /\{skeleton\}/);
});

test('default label is non-empty', () => {
  assert.match(src, /DEFAULT_LABEL = '[^']+'/);
});
