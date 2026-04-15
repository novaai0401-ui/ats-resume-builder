import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Error-boundary guardrails.
 *
 * TkxAlert's valid variants are info | success | warning | danger (no
 * "error"). An earlier iteration of these files used variant="error" and
 * the type-checker caught it — this test re-catches the same regression
 * at the source level so a runtime render path isn't required.
 *
 * We also assert:
 *   - client-component pragma, else Next.js errors at build-time,
 *   - the reset() prop is wired to a Try again button,
 *   - console.error fires from useEffect so devtools + external error
 *     tracking can observe the failure.
 */

const webRoot = path.resolve(__dirname, '..');
const rootError = readFileSync(path.join(webRoot, 'app', 'error.tsx'), 'utf8');
const resumeError = readFileSync(
  path.join(webRoot, 'app', 'resume', 'error.tsx'),
  'utf8',
);

for (const [name, src] of Object.entries({ rootError, resumeError })) {
  test(`${name}: marked as a client component`, () => {
    assert.match(src, /^['"]use client['"];/);
  });

  test(`${name}: uses TkxAlert with a valid variant`, () => {
    const match = src.match(/<TkxAlert[^>]*variant=\{?["']([^"'}]+)["']/);
    assert.ok(match, 'TkxAlert variant not found');
    const variant = match[1];
    assert.ok(
      ['info', 'success', 'warning', 'danger'].includes(variant),
      `variant="${variant}" is not a TkxAlert AlertVariant`,
    );
  });

  test(`${name}: wires reset() to a retry button`, () => {
    assert.match(src, /onClick=\{reset\}/);
  });

  test(`${name}: logs the error from useEffect for devtools observability`, () => {
    assert.match(src, /useEffect\(\s*\(\)\s*=>/);
    assert.match(src, /console\.error\(/);
  });
}
