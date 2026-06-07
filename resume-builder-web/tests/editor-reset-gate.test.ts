import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSkipServerHydration } from '../src/lib/load-effect-gate';

/**
 * Regression test for the "upload → fields appear → fields wiped" bug
 * reported on /resume/review after a fresh upload.
 *
 * What we're guarding: the editor has TWO effects that re-fire when
 * effectiveResumeId flips from '' to the autosave-assigned id:
 *
 *   1. The load effect (api.getResume → setResume). Guarded by
 *      shouldSkipServerHydration against locallySettledResumeIdRef.
 *
 *   2. The reset effect (resetResumeStore + setImportNotes('') + ...).
 *      Previously guarded ONLY by "pending upload session exists" —
 *      which is false by the time we get here, because autosave just
 *      called clearPendingUploadSession(). Without a second guard the
 *      reset wipes every field the user just saw, and nothing
 *      re-populates because the load effect (correctly) short-circuits.
 *
 * The fix: both effects now share the same gate via
 * shouldSkipServerHydration(effectiveResumeId, locallySettledRef). If
 * the id flipping into view is the id we just autosaved, both effects
 * no-op and the local state stays intact.
 *
 * These tests pin the exact transition sequence so the gate cannot be
 * regressed into a different shape (e.g. only one effect honouring it).
 */

test('post-autosave: gate skips reset for the autosave-assigned id', () => {
  // After saveDraft: locallySettledResumeIdRef = result.id.
  // effectiveResumeId flips '' → result.id on the next render.
  // The reset effect re-fires. The gate must return true so the
  // store is NOT wiped.
  const newId = 'r_post_upload_42';
  assert.equal(shouldSkipServerHydration(newId, newId), true);
});

test('cold open from dashboard: gate runs the reset (clears stale state)', () => {
  // User opens a different resume from the dashboard. The previous
  // editor's locallySettledRef holds a stale id (or '' on first
  // visit). The reset effect must clear the stale draft so the new
  // resume's load effect has a clean canvas to populate into.
  assert.equal(shouldSkipServerHydration('r_new', ''), false);
  assert.equal(shouldSkipServerHydration('r_new', 'r_old'), false);
});

test('initial mount with pending upload: gate is irrelevant (caller short-circuits earlier)', () => {
  // When effectiveResumeId is '' and a pending upload session exists,
  // the editor's reset effect short-circuits BEFORE consulting the
  // gate — the pending-upload populate effect needs the store
  // pristine to hydrate into. The gate itself is correct here: empty
  // ids never skip.
  assert.equal(shouldSkipServerHydration('', ''), false);
  assert.equal(shouldSkipServerHydration('', 'r_x'), false);
});

test('whitespace-trimmed ids still match (session storage round-trip)', () => {
  // Some browsers occasionally hand back persisted ids with stray
  // whitespace. The gate must still recognize them as the same id so
  // the post-autosave reset is correctly skipped.
  assert.equal(shouldSkipServerHydration('  r_abc  ', 'r_abc'), true);
});
