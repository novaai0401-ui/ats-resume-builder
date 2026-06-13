import assert from 'node:assert/strict';
import test from 'node:test';
import { colors, radius, rateToColor } from '../src/lib/theme-tokens';

const HEX = /^#[0-9a-f]{6}$/;

test('every color token is a valid 6-digit hex', () => {
  for (const [name, value] of Object.entries(colors)) {
    assert.match(value, HEX, `${name} should be a 6-digit hex, got ${value}`);
  }
});

test('required tokens are present', () => {
  for (const key of ['bg', 'ink', 'muted', 'border', 'primary', 'success', 'warning', 'danger']) {
    assert.ok(key in colors, `missing token ${key}`);
  }
});

test('radius scale is ascending', () => {
  assert.ok(radius.sm < radius.md && radius.md < radius.lg);
});

test('rateToColor grades green/amber/red and handles bad input', () => {
  assert.equal(rateToColor(0.25), colors.success);
  assert.equal(rateToColor(0.1), colors.warning);
  assert.equal(rateToColor(0.02), colors.danger);
  assert.equal(rateToColor(NaN), colors.muted);
});
