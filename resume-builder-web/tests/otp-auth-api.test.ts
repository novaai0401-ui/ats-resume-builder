import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/lib/api';

test('mobile OTP functions are removed from api client', () => {
  assert.equal('requestOtp' in api, false, 'api.requestOtp should not exist');
  assert.equal('verifyOtp' in api, false, 'api.verifyOtp should not exist');
});

test('email OTP functions are removed from api client', () => {
  assert.equal('requestEmailOtp' in api, false, 'api.requestEmailOtp should not exist — use password login instead');
  assert.equal('verifyEmailOtp' in api, false, 'api.verifyEmailOtp should not exist — use password login instead');
});

test('password login function exists on api client', () => {
  assert.equal(typeof api.loginWithPassword, 'function');
});

test('register function exists on api client', () => {
  assert.equal(typeof api.register, 'function');
});
