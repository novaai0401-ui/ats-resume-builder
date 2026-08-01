import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * R-099 — the JD skill-gap flow is the product's headline job-hunter task
 * ("here's the job, what am I missing?"), and it must be BOTH discoverable
 * and actionable:
 *
 *   • discoverable — the paste-a-JD box sits directly under the hero on the
 *     home page, above the feature grid, and says what it produces.
 *   • actionable — each missing skill has a one-tap add that writes into the
 *     resume (store first, then the saved copy), instead of leaving the user
 *     to retype it in the editor.
 *
 * These are source-level assertions on purpose: the behaviours live in a
 * client component whose live render needs the heavy jsdom harness that is
 * quarantined in this suite (see scripts/test.mjs).
 */

const webRoot = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(webRoot, rel), 'utf8');

const jdMatch = read('app/jd-match/JdMatchClient.tsx');
const quickStart = read('src/components/JdQuickStart.tsx');
const home = read('src/components/HomeLanding.tsx');

test('missing skills can be added to the resume in one tap', () => {
  assert.ok(/async function addSkill\(/.test(jdMatch), 'the add-skill action exists');
  assert.ok(jdMatch.includes('api.updateResume('), 'the add persists to the saved resume');
  assert.ok(jdMatch.includes('setResume('), 'the add updates the local draft immediately');
  assert.ok(jdMatch.includes('onClick={() => addSkill(kw)}'), 'each missing keyword is the button');
  assert.ok(
    jdMatch.includes('data-testid="jd-missing-skills"'),
    'the missing-skills section is addressable for UI tests',
  );
});

test('a duplicate skill is not appended twice', () => {
  assert.ok(
    jdMatch.includes('existing.some((s) => s.trim().toLowerCase() === clean.toLowerCase())'),
    'case-insensitive dedupe before the write',
  );
});

test('a failed save is reported honestly rather than shown as success (C-003)', () => {
  assert.ok(jdMatch.includes('setSkillSaveError('), 'a save failure has its own message');
  assert.ok(
    /saving to your stored resume failed/i.test(jdMatch),
    'the message says exactly what did not happen',
  );
});

test('the JD skill-gap entry point leads the home page, above the feature grid', () => {
  const jdIndex = home.indexOf('<JdQuickStart />');
  const featuresIndex = home.indexOf('{FEATURES.map(');
  const freeTierIndex = home.indexOf('{FREE_TIER.map(');
  assert.ok(jdIndex > 0, 'the quick start renders on the home page');
  assert.ok(jdIndex < featuresIndex, 'it sits above the feature grid');
  assert.ok(jdIndex < freeTierIndex, 'and above the free-tier list it used to hide under');
});

test('the entry point names the outcome (missing skills), not the mechanism', () => {
  assert.ok(/missing skills/i.test(quickStart), 'the heading/copy promises the skill gap');
  assert.ok(/\+ Add/.test(quickStart), 'and tells the user the skills can be added in one tap');
});

test('the home page free-tier list states the real free-AI rule', () => {
  // R-103 — full AI on the first resume, one free run each for the
  // standalone tools. The copy must match what the server enforces (C-003).
  assert.ok(/Full AI on your first resume/i.test(home), 'the per-resume rule is stated');
  assert.ok(/free once each/i.test(home), 'the standalone-tool rule is stated');
});
