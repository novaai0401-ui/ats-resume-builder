import assert from 'node:assert/strict';
import test from 'node:test';
import {
  presentVerdict,
  formatCallbackRate,
  callbackRateColor,
  CALLBACK_MIN_SAMPLE,
} from '../lib/outcomePresentation.js';

test('presentVerdict maps each verdict and falls back to maybe', () => {
  assert.equal(presentVerdict('advance').label, 'Advance');
  assert.equal(presentVerdict('maybe').label, 'Borderline');
  assert.equal(presentVerdict('reject').label, 'Reject');
  assert.equal(presentVerdict('???').label, 'Borderline');
});

test('formatCallbackRate respects the sample floor and clamps', () => {
  assert.equal(CALLBACK_MIN_SAMPLE, 5);
  assert.equal(formatCallbackRate(0.5, 4), '—');
  assert.equal(formatCallbackRate(0.4, 5), '40%');
  assert.equal(formatCallbackRate(2, 10), '100%');
  assert.equal(formatCallbackRate(NaN, 10), '—');
});

test('callbackRateColor grades red/amber/green', () => {
  assert.equal(callbackRateColor(0.3, 3), '#7a8aa0');
  assert.equal(callbackRateColor(0.25, 10), '#147a3a');
  assert.equal(callbackRateColor(0.1, 10), '#b07906');
  assert.equal(callbackRateColor(0.02, 10), '#a8412c');
});
