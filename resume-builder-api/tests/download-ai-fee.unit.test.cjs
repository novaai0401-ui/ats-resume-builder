const assert = require('node:assert/strict');
const test = require('node:test');
const { aiFeeApplies } = require('../dist/billing/download-charge.service.js');

// Contract: the flat per-download AI fee is added ONLY when OUR AI assisted
// the resume AND the user is not on a paid plan. BYOK never sets the flag,
// and the ₹499 plan waives the fee.

test('our-AI assist + FREE plan → fee applies', () => {
  assert.equal(aiFeeApplies(true, 'FREE'), true);
});

test('our-AI assist + null plan → fee applies', () => {
  assert.equal(aiFeeApplies(true, null), true);
  assert.equal(aiFeeApplies(true, undefined), true);
});

test('our-AI assist + paid plan → fee waived', () => {
  assert.equal(aiFeeApplies(true, 'PRO'), false);
  assert.equal(aiFeeApplies(true, 'STUDENT'), false);
});

test('no AI assist → never charged regardless of plan', () => {
  assert.equal(aiFeeApplies(false, 'FREE'), false);
  assert.equal(aiFeeApplies(false, 'PRO'), false);
});
