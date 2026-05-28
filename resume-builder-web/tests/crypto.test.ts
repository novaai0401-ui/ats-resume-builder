import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  decryptJson,
  encryptJson,
  generateRecoveryCode,
  InvalidUnlockError,
  isValidRecoveryCodeShape,
  normalizeRecoveryCode,
  rotatePassphrase,
  setupVault,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
} from '../src/lib/crypto/index';
import { encodeBase64Url, decodeBase64Url } from '../src/lib/crypto/aes-gcm';

const PASSPHRASE = 'correct horse battery staple';

test('setupVault returns a vault that round-trips with the same passphrase', async () => {
  const { vault, dek, recoveryCode } = await setupVault(PASSPHRASE);
  assert.equal(vault.schemaVersion, 1);
  assert.ok(vault.passphraseSalt && vault.recoverySalt);
  assert.ok(vault.passphraseWrap.ciphertext);
  assert.ok(vault.recoveryWrap.ciphertext);
  assert.equal(recoveryCode.canonical.length, 24);
  assert.ok(/^[0-9A-Z]+(-[0-9A-Z]+)+$/.test(recoveryCode.formatted));

  const encrypted = await encryptJson({ msg: 'hello' }, dek);
  const unlockedDek = await unlockWithPassphrase(PASSPHRASE, vault);
  const decrypted = await decryptJson<{ msg: string }>(encrypted, unlockedDek);
  assert.equal(decrypted.msg, 'hello');
});

test('unlockWithPassphrase throws InvalidUnlockError on wrong passphrase', async () => {
  const { vault } = await setupVault(PASSPHRASE);
  await assert.rejects(
    () => unlockWithPassphrase('wrong', vault),
    (err: unknown) => err instanceof InvalidUnlockError && err.reason === 'passphrase',
  );
});

test('unlockWithRecoveryCode unwraps the same DEK as the passphrase', async () => {
  const { vault, dek, recoveryCode } = await setupVault(PASSPHRASE);
  const ciphertext = await encryptJson({ secret: 42 }, dek);

  const recovered = await unlockWithRecoveryCode(recoveryCode.formatted, vault);
  const out = await decryptJson<{ secret: number }>(ciphertext, recovered);
  assert.equal(out.secret, 42);
});

test('unlockWithRecoveryCode accepts canonical form too', async () => {
  const { vault, recoveryCode } = await setupVault(PASSPHRASE);
  await unlockWithRecoveryCode(recoveryCode.canonical, vault); // does not throw
});

test('unlockWithRecoveryCode rejects a wrong code', async () => {
  const { vault } = await setupVault(PASSPHRASE);
  await assert.rejects(
    () => unlockWithRecoveryCode('ABCD-EFGH-JKMN-PQRS-TVWX-YZ01', vault),
    (err: unknown) => err instanceof InvalidUnlockError && err.reason === 'recovery-code',
  );
});

test('rotatePassphrase keeps the same DEK and invalidates the old passphrase', async () => {
  const { vault, dek } = await setupVault(PASSPHRASE);
  const ciphertext = await encryptJson({ a: 1 }, dek);

  const { passphraseSalt, passphraseWrap } = await rotatePassphrase(dek, 'new-passphrase-9');
  const rotatedVault = { ...vault, passphraseSalt, passphraseWrap };

  // Old passphrase no longer works.
  await assert.rejects(() => unlockWithPassphrase(PASSPHRASE, rotatedVault));
  // New one does, and decrypts old ciphertext.
  const newDek = await unlockWithPassphrase('new-passphrase-9', rotatedVault);
  const decrypted = await decryptJson<{ a: number }>(ciphertext, newDek);
  assert.equal(decrypted.a, 1);
});

test('rotatePassphrase does NOT invalidate the recovery code', async () => {
  const { vault, dek, recoveryCode } = await setupVault(PASSPHRASE);
  const { passphraseSalt, passphraseWrap } = await rotatePassphrase(dek, 'another-new-pass');
  const rotatedVault = { ...vault, passphraseSalt, passphraseWrap };
  await unlockWithRecoveryCode(recoveryCode.formatted, rotatedVault);
});

test('encryptJson tamper detection: flipping a byte in ciphertext throws', async () => {
  const { dek } = await setupVault(PASSPHRASE);
  const blob = await encryptJson({ hello: 'world' }, dek);
  const tampered = decodeBase64Url(blob.ciphertext);
  tampered[0] ^= 0x80;
  const tamperedBlob = { iv: blob.iv, ciphertext: encodeBase64Url(tampered) };
  await assert.rejects(() => decryptJson(tamperedBlob, dek));
});

test('setupVault rejects short passphrases', async () => {
  await assert.rejects(() => setupVault('short'));
});

test('rotatePassphrase rejects short passphrases', async () => {
  const { dek } = await setupVault(PASSPHRASE);
  await assert.rejects(() => rotatePassphrase(dek, 'short'));
});

test('normalizeRecoveryCode resolves Crockford look-alikes', async () => {
  // i→1, l→1, o→0, u→V — verify case-insensitive + dash-tolerant.
  // Input 'abcd-Iolu-1234' uppercases to ABCDIOLU1234; substitutions
  // give ABCD-1-0-1-V-1234 → 'ABCD101V1234'.
  const out = normalizeRecoveryCode('abcd-Iolu-1234');
  assert.equal(out, 'ABCD101V1234');
});

test('isValidRecoveryCodeShape only accepts 24-char codes from the alphabet', () => {
  const good = generateRecoveryCode();
  assert.equal(isValidRecoveryCodeShape(good.formatted), true);
  assert.equal(isValidRecoveryCodeShape(good.canonical), true);
  assert.equal(isValidRecoveryCodeShape('too-short'), false);
  // Contains 'I' which normalizes to '1' — should pass.
  assert.equal(isValidRecoveryCodeShape('ABCD-EFGI-JKMN-PQRS-TVWX-YZ01'), true);
});

test('recovery codes are unique on every call', async () => {
  const a = generateRecoveryCode();
  const b = generateRecoveryCode();
  const c = generateRecoveryCode();
  assert.notEqual(a.canonical, b.canonical);
  assert.notEqual(b.canonical, c.canonical);
});

test('two setupVault calls produce different DEKs even with the same passphrase', async () => {
  const a = await setupVault(PASSPHRASE);
  const b = await setupVault(PASSPHRASE);
  const blob = await encryptJson({ x: 1 }, a.dek);
  await assert.rejects(() => decryptJson(blob, b.dek));
});
