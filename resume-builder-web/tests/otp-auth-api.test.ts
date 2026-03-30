import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/lib/api';

test('mobile OTP functions are removed from api client', () => {
  assert.equal('requestOtp' in api, false, 'api.requestOtp should not exist');
  assert.equal('verifyOtp' in api, false, 'api.verifyOtp should not exist');
});

test('email/password login function is removed from api client', () => {
  assert.equal('login' in api, false, 'api.login should not exist — use Email OTP flow instead');
});

test('email OTP functions exist on api client', () => {
  assert.equal(typeof api.requestEmailOtp, 'function');
  assert.equal(typeof api.verifyEmailOtp, 'function');
});

test('register function exists on api client', () => {
  assert.equal(typeof api.register, 'function');
});
