import assert from 'node:assert/strict';
import test from 'node:test';
import { splitBulletIntoBullets, canSplitBullet, shortenBulletText, wordCount, BULLET_MAX_WORDS } from '@/src/lib/bullet-utils';

const LONG = 'Led an Assistant Vice President, owned technical leadership for the UI platform, taking responsibility for frontend architecture, system modernization, and delivery quality. Led architectural initiatives including framework upgrades, performance optimization, backend driven UI design, and microfrontend adoption, while mentoring engineers and ensuring alignment between business requirements, non functional requirements, and long-term platform stability.';

test('the sample bullet is over the ATS word limit', () => {
  assert.ok(wordCount(LONG) > BULLET_MAX_WORDS);
});

test('canSplitBullet is true for a long multi-part bullet, false for a short one', () => {
  assert.equal(canSplitBullet(LONG), true);
  assert.equal(canSplitBullet('Managed a team of five engineers.'), false);
  assert.equal(canSplitBullet(''), false);
});

test('splitBulletIntoBullets yields multiple tidy single-idea bullets', () => {
  const pieces = splitBulletIntoBullets(LONG);
  assert.ok(pieces.length >= 2, `expected 2+, got ${pieces.length}`);
  for (const p of pieces) {
    assert.match(p, /^[A-Z]/, `capitalized: "${p}"`);
    assert.match(p, /[.!?]$/, `terminated: "${p}"`);
    assert.ok(wordCount(p) >= 2);
  }
});

test('a bullet already within the limit is returned unchanged (single element)', () => {
  const one = 'Reduced infra cost by 30% through autoscaling.';
  assert.deepEqual(splitBulletIntoBullets(one), [one]);
});

test('splitting reduces the max piece length versus the original', () => {
  const pieces = splitBulletIntoBullets(LONG);
  const maxPiece = Math.max(...pieces.map(wordCount));
  assert.ok(maxPiece < wordCount(LONG), 'each piece is shorter than the original');
});

test('split pieces never echo the leaked job title or a dangling fragment', () => {
  for (const p of splitBulletIntoBullets(LONG)) {
    assert.doesNotMatch(p, /assistant vice president/i, `leaked title: "${p}"`);
    assert.doesNotMatch(p, /\b(by|with|for|to|of|and|as|via)\.?$/i, `dangling: "${p}"`);
  }
});

test('shortenBulletText tightens a long single-sentence bullet below the limit', () => {
  const single =
    'Led and delivered a React-Redux modernization program for a legacy enterprise application, significantly improving runtime performance and application stability while achieving zero production defects and faster release cycles across engineering teams';
  assert.ok(wordCount(single) > BULLET_MAX_WORDS);
  const s = shortenBulletText(single);
  assert.ok(wordCount(s) <= BULLET_MAX_WORDS, `still too long (${wordCount(s)}): "${s}"`);
  assert.ok(wordCount(s) < wordCount(single));
  assert.match(s, /^[A-Z]/);
  assert.match(s, /[.!?]$/);
});

test('shortenBulletText leaves an in-range bullet unchanged', () => {
  const one = 'Reduced infra cost by 30% through autoscaling.';
  assert.equal(shortenBulletText(one), one);
});
