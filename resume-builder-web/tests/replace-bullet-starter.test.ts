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
  // word so the chip click does *something* useful.
  assert.equal(
    replaceBulletStarter('Quickly shipped a redesign of checkout', 'Shipped'),
    'Shipped shipped a redesign of checkout',
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
