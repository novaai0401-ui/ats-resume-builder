import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptBackup, decryptBackup, ZK_BACKUP_VERSION } from '../src/lib/zk-crypto';

const sample = {
  title: 'Senior Backend Engineer',
  contact: { fullName: 'Ada Lovelace', email: 'ada@example.com' },
  skills: ['node.js', 'postgres', 'aws'],
  experience: [{ company: 'Acme', role: 'Lead', highlights: ['Built X', 'Scaled Y'] }],
};

test('round-trips a resume object through encrypt/decrypt', async () => {
  const blob = await encryptBackup(sample, 'correct horse battery');
  const restored = await decryptBackup(blob, 'correct horse battery');
  assert.deepEqual(restored, sample);
});

test('produces a versioned envelope with no plaintext leakage', async () => {
  const blob = await encryptBackup(sample, 'correct horse battery');
  const env = JSON.parse(blob);
  assert.equal(env.v, ZK_BACKUP_VERSION);
  assert.equal(env.kdf, 'PBKDF2-SHA256');
  assert.ok(env.salt && env.iv && env.ct);
  // None of the sensitive strings should appear in the serialized blob.
  assert.equal(blob.includes('Ada Lovelace'), false);
  assert.equal(blob.includes('ada@example.com'), false);
  assert.equal(blob.includes('Acme'), false);
});

test('a wrong passphrase fails to decrypt', async () => {
  const blob = await encryptBackup(sample, 'the-right-one');
  await assert.rejects(() => decryptBackup(blob, 'the-wrong-one'), /Wrong passphrase/);
});

test('tampered ciphertext is rejected (GCM auth)', async () => {
  const blob = await encryptBackup(sample, 'passphrase-123');
  const env = JSON.parse(blob);
  // Flip a character in the ciphertext.
  env.ct = env.ct.slice(0, -2) + (env.ct.slice(-2) === 'AA' ? 'BB' : 'AA');
  await assert.rejects(() => decryptBackup(JSON.stringify(env), 'passphrase-123'), /Wrong passphrase|altered/);
});

test('two encryptions of the same data differ (random salt + iv)', async () => {
  const a = await encryptBackup(sample, 'passphrase-123');
  const b = await encryptBackup(sample, 'passphrase-123');
  assert.notEqual(a, b);
});

test('rejects short passphrases on encrypt', async () => {
  await assert.rejects(() => encryptBackup(sample, 'short'), /at least 8/);
});

test('rejects a non-backup string on decrypt', async () => {
  await assert.rejects(() => decryptBackup('not json', 'passphrase-123'), /not a valid backup/);
});
