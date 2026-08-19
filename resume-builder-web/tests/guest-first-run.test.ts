import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * R-102 — what a signed-out first-time visitor can and cannot do.
 *
 * The reported bug: /resume/start and the editor fired authed API calls for
 * a visitor with no token, so the page answered with raw 401s
 * ("Unauthorized" in the editor, a red /me/training-consent in the network
 * tab) and uploading was refused outright.
 *
 * The contract now:
 *   • editing is free and needs no account;
 *   • uploading + parsing works signed-out (the anonymous route);
 *   • every account-only button opens the sign-in gate instead of calling
 *     an authed endpoint;
 *   • no authed request fires without a token.
 */

const webRoot = path.resolve(__dirname, '..');
// Normalise CRLF -> LF. These tests assert on source text, and some
// assertions embed a literal "\n" (e.g. the saveDraft guard below). On a
// Windows checkout the files are CRLF, so those matches fail even though the
// code is correct — a false failure that says "saveDraft opens the gate for
// guests" is broken when it is not.
const read = (rel: string) =>
  readFileSync(path.join(webRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const api = read('src/lib/api.ts');
const editor = read('app/resume/ResumeEditor.tsx');
const startClient = read('app/resume/start/ResumeStartClient.tsx');
const consentModal = read('src/components/TrainingConsentModal.tsx');

test('a signed-out upload goes to the anonymous parse route', () => {
  assert.ok(
    api.includes("getAccessToken() ? '/resumes/parse-upload' : '/public/parse-upload'"),
    'uploadResume must pick the route by auth state',
  );
});

test('the start page no longer refuses a guest upload', () => {
  assert.ok(
    !/needs a free account/i.test(startClient),
    'the "uploading needs an account" block is gone',
  );
  assert.ok(startClient.includes('ingestResumeFile(file)'), 'guests still run the same parse');
});

test('the training-consent probe is token-guarded', () => {
  const effectStart = consentModal.indexOf('useEffect(');
  const guardIndex = consentModal.indexOf('if (!getAccessToken()) return;');
  const fetchIndex = consentModal.indexOf('getTrainingConsent()');
  assert.ok(guardIndex > effectStart, 'the guard is inside the effect');
  assert.ok(guardIndex < fetchIndex, 'the guard runs BEFORE the authed request');
});

test('every account-only editor action opens the gate instead of calling the API', () => {
  // One assertion per gated action, so a future refactor that drops a
  // single guard fails with the name of the action it dropped.
  for (const fn of [
    'async function score()',
    'async function parseJd()',
    'function critique()',
    'function analyzeTechGap()',
    'async function exportPdf()',
    'async function continueToAts()',
  ]) {
    const at = editor.indexOf(fn);
    assert.ok(at > 0, `${fn} still exists`);
    const body = editor.slice(at, at + 260);
    assert.ok(
      body.includes('guardGuestAction()'),
      `${fn} must call guardGuestAction() before any API call`,
    );
  }
  // Save and per-bullet AI rewrite use the same gate via a direct check.
  assert.ok(
    editor.includes("if (!getAccessToken()) {\n      setGuestGateOpen(true);"),
    'saveDraft opens the gate for guests',
  );
});

test('the gate offers sign-in as well as signup, and returns the visitor to the editor', () => {
  assert.ok(editor.includes('Sign in to continue'), 'the dialog leads with signing in');
  assert.ok(
    editor.includes('/auth/login?next=${encodeURIComponent(guestReturnPath)}'),
    'existing users get a sign-in link back to this page',
  );
  assert.ok(
    editor.includes('/auth/register?next=${encodeURIComponent(guestReturnPath)}'),
    'new users come back to the same page after signup',
  );
  assert.ok(/Keep editing/.test(editor), 'dismissing keeps the visitor in the editor');
});

test('the editor still fires no authed request without a token', () => {
  // Each of these effects/handlers hits an account-only endpoint; all must
  // bail out early when there is no token.
  for (const marker of [
    'api.getDownloadChargeConfig()',
    'api.getBillingStatus()',
    'api.recomputeResume(resumeId)',
  ]) {
    const at = editor.indexOf(marker);
    assert.ok(at > 0, `${marker} still exists`);
    const preceding = editor.slice(Math.max(0, at - 400), at);
    assert.ok(
      preceding.includes('getAccessToken()'),
      `${marker} must be behind a token check`,
    );
  }
});
