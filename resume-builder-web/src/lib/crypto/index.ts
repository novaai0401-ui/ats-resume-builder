/**
 * Zero-knowledge crypto — high-level orchestration.
 *
 * Three flows, in product terms:
 *
 *   1. setup(passphrase) — first-time call. Generates the per-user salt,
 *      a fresh data-encryption key, and a recovery code; wraps the DEK
 *      under both the passphrase-derived KEK and the recovery-code KEK.
 *      Returns everything the server needs to persist (salts, wrapped
 *      keys, KDF params) plus the unwrapped DEK to keep in memory for
 *      this session.
 *
 *   2. unlock(passphrase | recoveryCode, vaultPublic) — every subsequent
 *      login. Re-derives the KEK, unwraps the DEK. The unwrapped DEK
 *      lives only in memory; never persisted, never sent to the server.
 *
 *   3. rotatePassphrase(oldDek, newPassphrase, salt) — re-wrap the
 *      same DEK under a new passphrase-derived KEK. Used by the
 *      "forgot passphrase" flow after recovery-code unlock.
 *
 * Everything below is pure WebCrypto. No external deps, no WASM.
 */

import { encodeBase64Url, decodeBase64Url } from './aes-gcm';
import {
  DEFAULT_KDF_PARAMS,
  deriveKeyEncryptionKey,
  generateDataEncryptionKey,
  generateSalt,
  type KdfParams,
} from './key-derivation';
import { generateRecoveryCode, normalizeRecoveryCode, type RecoveryCode } from './recovery-code';
import { unwrapDataKey, wrapDataKey, type WrappedKey } from './wrapping';

/**
 * Public-side material safe to persist on the server. Holds NO secrets
 * — the wrapped keys cannot be unwrapped without the user's passphrase
 * or recovery code.
 */
export interface VaultPublic {
  schemaVersion: 1;
  kdfParams: KdfParams;
  /** Salt for the passphrase KDF (base64url). */
  passphraseSalt: string;
  /** Salt for the recovery-code KDF (base64url). */
  recoverySalt: string;
  /** DEK wrapped by the passphrase-derived KEK. */
  passphraseWrap: WrappedKey;
  /** DEK wrapped by the recovery-code-derived KEK. */
  recoveryWrap: WrappedKey;
}

export interface SetupResult {
  vault: VaultPublic;
  dek: CryptoKey;
  recoveryCode: RecoveryCode;
}

export async function setupVault(passphrase: string): Promise<SetupResult> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }
  const passphraseSalt = generateSalt();
  const recoverySalt = generateSalt();

  const passphraseKek = await deriveKeyEncryptionKey(passphrase, passphraseSalt);
  const recoveryCode = generateRecoveryCode();
  const recoveryKek = await deriveKeyEncryptionKey(recoveryCode.canonical, recoverySalt);

  const dek = await generateDataEncryptionKey();
  const passphraseWrap = await wrapDataKey(dek, passphraseKek);
  const recoveryWrap = await wrapDataKey(dek, recoveryKek);

  return {
    vault: {
      schemaVersion: 1,
      kdfParams: DEFAULT_KDF_PARAMS,
      passphraseSalt: encodeBase64Url(passphraseSalt),
      recoverySalt: encodeBase64Url(recoverySalt),
      passphraseWrap,
      recoveryWrap,
    },
    dek,
    recoveryCode,
  };
}

/** Unlock with the user's passphrase. Throws on wrong passphrase. */
export async function unlockWithPassphrase(passphrase: string, vault: VaultPublic): Promise<CryptoKey> {
  const salt = decodeBase64Url(vault.passphraseSalt);
  const kek = await deriveKeyEncryptionKey(passphrase, salt, vault.kdfParams);
  try {
    return await unwrapDataKey(vault.passphraseWrap, kek);
  } catch {
    throw new InvalidUnlockError('passphrase');
  }
}

/** Unlock with the recovery code. Throws on wrong code. */
export async function unlockWithRecoveryCode(rawCode: string, vault: VaultPublic): Promise<CryptoKey> {
  const canonical = normalizeRecoveryCode(rawCode);
  const salt = decodeBase64Url(vault.recoverySalt);
  const kek = await deriveKeyEncryptionKey(canonical, salt, vault.kdfParams);
  try {
    return await unwrapDataKey(vault.recoveryWrap, kek);
  } catch {
    throw new InvalidUnlockError('recovery-code');
  }
}

/**
 * Re-wrap the existing DEK under a new passphrase. Returns the updated
 * `passphraseSalt` + `passphraseWrap`; the rest of the vault stays
 * unchanged so the existing recovery code remains valid.
 */
export async function rotatePassphrase(
  dek: CryptoKey,
  newPassphrase: string,
): Promise<{ passphraseSalt: string; passphraseWrap: WrappedKey }> {
  if (!newPassphrase || newPassphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }
  const salt = generateSalt();
  const kek = await deriveKeyEncryptionKey(newPassphrase, salt);
  const passphraseWrap = await wrapDataKey(dek, kek);
  return { passphraseSalt: encodeBase64Url(salt), passphraseWrap };
}

export class InvalidUnlockError extends Error {
  constructor(public readonly reason: 'passphrase' | 'recovery-code') {
    super(reason === 'passphrase' ? 'Wrong passphrase.' : 'Wrong recovery code.');
    this.name = 'InvalidUnlockError';
  }
}

export {
  encryptJson,
  decryptJson,
  encryptBytes,
  decryptBytes,
  type EncryptedBlob,
} from './aes-gcm';
export { generateRecoveryCode, normalizeRecoveryCode, isValidRecoveryCodeShape, type RecoveryCode } from './recovery-code';
