const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('presentVerdict returns the right treatment per verdict', async () => {
  const { presentVerdict } = await sharedPromise;
  assert.equal(presentVerdict('advance').label, 'Advance');
  assert.equal(presentVerdict('maybe').label, 'Borderline');
  assert.equal(presentVerdict('reject').label, 'Reject');
});

test('presentVerdict falls back to "maybe" for unknown input', async () => {
  const { presentVerdict } = await sharedPromise;
  assert.equal(presentVerdict('hire').label, 'Borderline');
  assert.equal(presentVerdict('').label, 'Borderline');
});

test('every verdict treatment has color, background and blurb', async () => {
  const { presentVerdict } = await sharedPromise;
  for (const v of ['advance', 'maybe', 'reject']) {
    const p = presentVerdict(v);
    assert.match(p.color, /^#/);
    assert.ok(p.background.length > 0);
    assert.ok(p.blurb.length > 0);
  }
});

test('formatCallbackRate hides rate below the sample floor', async () => {
  const { formatCallbackRate, CALLBACK_MIN_SAMPLE } = await sharedPromise;
  assert.equal(CALLBACK_MIN_SAMPLE, 5);
  assert.equal(formatCallbackRate(0.5, 4), '—');
  assert.equal(formatCallbackRate(0.4, 5), '40%');
  assert.equal(formatCallbackRate(0.333, 10), '33%');
});

test('formatCallbackRate clamps and handles bad input', async () => {
  const { formatCallbackRate } = await sharedPromise;
  assert.equal(formatCallbackRate(1.5, 10), '100%');
  assert.equal(formatCallbackRate(-0.2, 10), '0%');
  assert.equal(formatCallbackRate(NaN, 10), '—');
});

test('callbackRateColor grades red/amber/green and grey below sample', async () => {
  const { callbackRateColor } = await sharedPromise;
  assert.equal(callbackRateColor(0.3, 3), '#7a8aa0'); // not enough samples
  assert.equal(callbackRateColor(0.25, 10), '#147a3a'); // green >= 20%
  assert.equal(callbackRateColor(0.1, 10), '#b07906'); // amber 8-19%
  assert.equal(callbackRateColor(0.02, 10), '#a8412c'); // red < 8%
});
