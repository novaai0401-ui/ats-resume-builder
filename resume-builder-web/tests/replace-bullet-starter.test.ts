import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceBulletStarter } from '../src/lib/action-verb-rule';

// The original implementation only stripped a weak phrase when the
// bullet *began* with one. The bug the project owner reported was
// "Implemented participated in design discussions..." — caused by an
// "Actively"/intensifier prefix shielding "participated in" from the
// start-only check. These tests pin the new behaviour: scan the first
// ~6 words for a weak phrase and strip up through it.

test('replaces a leading weak starter phrase', () => {
  assert.equal(
    replaceBulletStarter('Responsible for managing the team', 'Led'),
    'Led managing the team',
  );
});

test('replaces a weak phrase shielded by an intensifier (regression)', () => {
  // The exact failure pattern from the production bug report.
  assert.equal(
    replaceBulletStarter(
      'Actively participated in design discussions and architectural decision-making.',
      'Implemented',
    ),
    'Implemented design discussions and architectural decision-making.',
  );
});

test('replaces "I was responsible for" without leaving "responsible for" behind', () => {
  assert.equal(
    replaceBulletStarter('I was responsible for migrating the platform', 'Owned'),
    'Owned migrating the platform',
  );
});

test('strips a leading connector after the weak phrase', () => {
  assert.equal(
    replaceBulletStarter('Successfully helped and reviewed the rollout', 'Drove'),
    'Drove reviewed the rollout',
  );
});

test('falls back to first-word strip when no weak phrase is found', () => {
  // Bullet has no recognisable weak opener; we still swap the first
  // word so the chip click does *something* useful. The dedupe rule
  // then catches the "Shipped shipped" duplicate and removes the
  // second one.
  assert.equal(
    replaceBulletStarter('Quickly shipped a redesign of checkout', 'Shipped'),
    'Shipped a redesign of checkout',
  );
});

test('preserves bullet-list prefix characters', () => {
  assert.equal(
    replaceBulletStarter('• Responsible for hiring engineers', 'Led'),
    '• Led hiring engineers',
  );
});

test('returns capitalised verb when bullet is empty', () => {
  assert.equal(replaceBulletStarter('', 'Led'), 'Led');
});

test('no-op when verb is empty', () => {
  assert.equal(
    replaceBulletStarter('Responsible for hiring engineers', ''),
    'Responsible for hiring engineers',
  );
});

test('does not duplicate the chosen verb when it follows an intensifier (regression)', () => {
  // Production bug: "Successfully delivered multiple zero-defect UI
  // projects..." + Delivered chip produced "Delivered delivered
  // multiple..." because "Successfully" was stripped as the first
  // word, leaving "delivered" at the head, then prepending
  // "Delivered" again.
  assert.equal(
    replaceBulletStarter(
      'Successfully delivered multiple zero-defect UI projects, improving delivery reliability.',
      'Delivered',
    ),
    'Delivered multiple zero-defect UI projects, improving delivery reliability.',
  );
});

test('does not strip a different strong verb after intensifier strip', () => {
  // "Carefully designed the API surface" → swap with "Built". After
  // stripping "Carefully" the rest starts with "designed" — also a
  // strong verb but a different one, so we keep it. Result reads as
  // "Built designed..." which the user can polish; we'd rather keep
  // a meaningful word than drop it.
  assert.equal(
    replaceBulletStarter('Carefully designed the API surface', 'Built'),
    'Built designed the API surface',
  );
});

test('preserves "managing" after replacing "responsible for" (regression for over-aggressive strip)', () => {
  // Earlier draft of the dedupe logic stripped *any* strong verb at
  // the head, which would have turned this into "Led the team" —
  // dropping "managing" loses the management context. Keep it.
  assert.equal(
    replaceBulletStarter('Responsible for managing the team', 'Led'),
    'Led managing the team',
  );
});
