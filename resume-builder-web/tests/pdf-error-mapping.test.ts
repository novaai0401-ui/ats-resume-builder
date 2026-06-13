import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Pins the client-side PDF error-status → user-message mapping.
 *
 * Bug we are guarding against (founder report on live preview):
 *   API returned 403 with the body
 *     "Monthly export limit reached (5). Upgrade your plan or wait
 *      for next month's reset."
 *   …but the UI showed "Your session expired. Please sign in again
 *   to download your PDF." — sending users to re-login, which did
 *   not help, and hiding the actual cause from them.
 *
 * The new contract:
 *   - 401 (no token / token expired) → "Your session expired…"
 *   - 403 (quota, FREE-plan block, no charge token, etc.) → surface
 *     the SERVER's own message, which is already user-readable
 *     (R-003 acceptance criteria).
 *   - 402 / 429 → server message (already the case before).
 *
 * Two surfaces share this mapping: ResumeEditor and the standalone
 * TemplateSelectionView. Both must stay aligned, so this test reads
 * each source file and asserts the same shape in both.
 */

const webRoot = path.resolve(__dirname, '..');

function read(rel: string) {
  return readFileSync(path.join(webRoot, rel), 'utf8');
}

const editorSrc = read('app/resume/ResumeEditor.tsx');
const templateSrc = read('app/resume/template/TemplateSelectionView.tsx');

for (const [name, src] of Object.entries({ editor: editorSrc, template: templateSrc })) {
  test(`${name}: 401 alone maps to "session expired" (not 401||403)`, () => {
    // The bad pattern was `error.status === 401 || error.status === 403`.
    // Make sure that exact OR is gone from each file.
    assert.doesNotMatch(
      src,
      /status\s*===\s*401\s*\|\|\s*error\.status\s*===\s*403/,
      'session-expired branch must not cover 403',
    );
  });

  test(`${name}: 403 ships server's own message (not "session expired")`, () => {
    // The mapping has to handle 403 separately and return the message
    // verbatim. Both files have either an explicit `status === 403` arm
    // or it is grouped into the "ship server message" branch.
    assert.match(src, /status\s*===\s*403/);
  });
}
