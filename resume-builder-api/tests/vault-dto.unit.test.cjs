const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isValidKdfParams,
  isValidVaultPublic,
  isValidWrappedKey,
  MAX_VAULT_FIELD_LEN,
} = require('../dist/vault/vault.dto.js');

function validVaultPublic() {
  return {
    schemaVersion: 1,
    kdfParams: { algo: 'PBKDF2', hash: 'SHA-256', iterations: 600000 },
    passphraseSalt: 'AAAAAA',
    recoverySalt: 'BBBBBB',
    passphraseWrap: { iv: 'aaaa', ciphertext: 'bbbb' },
    recoveryWrap: { iv: 'cccc', ciphertext: 'dddd' },
  };
}

test('isValidKdfParams accepts canonical params', () => {
  assert.equal(isValidKdfParams({ algo: 'PBKDF2', hash: 'SHA-256', iterations: 600000 }), true);
});

test('isValidKdfParams rejects iterations below OWASP floor', () => {
  assert.equal(isValidKdfParams({ algo: 'PBKDF2', hash: 'SHA-256', iterations: 1000 }), false);
});

test('isValidKdfParams rejects unsupported algo', () => {
  assert.equal(isValidKdfParams({ algo: 'scrypt', hash: 'SHA-256', iterations: 600000 }), false);
  assert.equal(isValidKdfParams({ algo: 'PBKDF2', hash: 'SHA-1', iterations: 600000 }), false);
});

test('isValidKdfParams rejects insanely large iterations', () => {
  assert.equal(isValidKdfParams({ algo: 'PBKDF2', hash: 'SHA-256', iterations: 1e9 }), false);
});

test('isValidWrappedKey requires both iv and ciphertext', () => {
  assert.equal(isValidWrappedKey({ iv: 'a', ciphertext: 'b' }), true);
  assert.equal(isValidWrappedKey({ iv: 'a' }), false);
  assert.equal(isValidWrappedKey({ ciphertext: 'b' }), false);
  assert.equal(isValidWrappedKey(null), false);
  assert.equal(isValidWrappedKey('plain string'), false);
});

test('isValidWrappedKey rejects oversize fields', () => {
  assert.equal(
    isValidWrappedKey({ iv: 'a', ciphertext: 'b'.repeat(MAX_VAULT_FIELD_LEN + 1) }),
    false,
  );
});

test('isValidVaultPublic accepts a well-formed vault', () => {
  assert.equal(isValidVaultPublic(validVaultPublic()), true);
});

test('isValidVaultPublic rejects missing salts', () => {
  const v = validVaultPublic();
  delete v.passphraseSalt;
  assert.equal(isValidVaultPublic(v), false);
  const v2 = validVaultPublic();
  delete v2.recoverySalt;
  assert.equal(isValidVaultPublic(v2), false);
});

test('isValidVaultPublic rejects schemaVersion drift', () => {
  const v = validVaultPublic();
  v.schemaVersion = 2;
  assert.equal(isValidVaultPublic(v), false);
});

test('isValidVaultPublic rejects empty wrapped key fields', () => {
  const v = validVaultPublic();
  v.passphraseWrap = { iv: '', ciphertext: '' };
  assert.equal(isValidVaultPublic(v), false);
});

test('isValidVaultPublic rejects non-object input', () => {
  assert.equal(isValidVaultPublic(null), false);
  assert.equal(isValidVaultPublic('string'), false);
  assert.equal(isValidVaultPublic(42), false);
});
