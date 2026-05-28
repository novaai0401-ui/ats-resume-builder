/**
 * DTO shapes for the vault endpoints. Validation is permissive on the
 * server: every field is opaque (base64url string or JSON we never
 * read), so the only checks we can do are presence + length caps.
 */

export interface KdfParamsDto {
  algo: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
}

export interface WrappedKeyDto {
  iv: string;
  ciphertext: string;
}

export interface VaultPublicDto {
  schemaVersion: 1;
  kdfParams: KdfParamsDto;
  passphraseSalt: string;
  recoverySalt: string;
  passphraseWrap: WrappedKeyDto;
  recoveryWrap: WrappedKeyDto;
}

export interface RotatePassphraseDto {
  passphraseSalt: string;
  passphraseWrap: WrappedKeyDto;
}

/** Length cap for base64url salts / wrapped blobs. Real values are well
 *  under 1 KB; the cap exists only to bound malicious payloads. */
export const MAX_VAULT_FIELD_LEN = 4096;

export function isValidWrappedKey(value: unknown): value is WrappedKeyDto {
  if (!value || typeof value !== 'object') return false;
  const wk = value as Record<string, unknown>;
  return (
    typeof wk.iv === 'string' &&
    typeof wk.ciphertext === 'string' &&
    wk.iv.length > 0 &&
    wk.iv.length <= MAX_VAULT_FIELD_LEN &&
    wk.ciphertext.length > 0 &&
    wk.ciphertext.length <= MAX_VAULT_FIELD_LEN
  );
}

export function isValidKdfParams(value: unknown): value is KdfParamsDto {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    p.algo === 'PBKDF2' &&
    p.hash === 'SHA-256' &&
    typeof p.iterations === 'number' &&
    Number.isFinite(p.iterations) &&
    p.iterations >= 100_000 &&  // OWASP floor; rejects intentionally weak vaults
    p.iterations <= 10_000_000
  );
}

export function isValidVaultPublic(value: unknown): value is VaultPublicDto {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === 1 &&
    isValidKdfParams(v.kdfParams) &&
    typeof v.passphraseSalt === 'string' &&
    v.passphraseSalt.length > 0 &&
    v.passphraseSalt.length <= MAX_VAULT_FIELD_LEN &&
    typeof v.recoverySalt === 'string' &&
    v.recoverySalt.length > 0 &&
    v.recoverySalt.length <= MAX_VAULT_FIELD_LEN &&
    isValidWrappedKey(v.passphraseWrap) &&
    isValidWrappedKey(v.recoveryWrap)
  );
}
