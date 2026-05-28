/**
 * Key derivation — PBKDF2-SHA256 via WebCrypto.
 *
 * Parameters follow OWASP 2024 guidance: SHA-256, 600,000 iterations,
 * 256-bit output. The salt is per-user and stored in plaintext on the
 * server — its only job is to defeat rainbow tables.
 *
 * We picked PBKDF2 over Argon2 deliberately:
 *   - PBKDF2 is native to WebCrypto. No WASM dependency, no bundle size hit.
 *   - Argon2 is stronger but requires shipping a WASM binary, which slows
 *     first-load and adds an audit surface. We can swap later behind this
 *     module's interface if the threat model changes.
 *
 * Output is a non-extractable AES-GCM CryptoKey suitable for use as a
 * key-encryption key (KEK). The actual data-encryption key (DEK) is
 * generated separately and wrapped by the KEK — see wrapping.ts.
 */

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = 'SHA-256' as const;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

export interface KdfParams {
  algo: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  algo: 'PBKDF2',
  hash: PBKDF2_HASH,
  iterations: PBKDF2_ITERATIONS,
};

/** Crypto-strength random bytes. Throws if the platform has no CSPRNG. */
export function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

/** A fresh per-user salt. Store this in plaintext on the server. */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/**
 * Derive a key-encryption key from a passphrase + salt. Output is
 * non-extractable so the raw bytes never leave the WebCrypto boundary.
 */
export async function deriveKeyEncryptionKey(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<CryptoKey> {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Passphrase must be a non-empty string.');
  }
  if (params.algo !== 'PBKDF2' || params.hash !== 'SHA-256') {
    throw new Error(`Unsupported KDF params: ${JSON.stringify(params)}`);
  }
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: params.hash,
      iterations: params.iterations,
      salt,
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/**
 * Generate a fresh data-encryption key (DEK). Marked extractable=true
 * so it can be wrapped by the KEK. The wrapped form is what gets
 * persisted; the raw DEK lives only in memory.
 */
export async function generateDataEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: KEY_LENGTH_BITS }, true, ['encrypt', 'decrypt']);
}
