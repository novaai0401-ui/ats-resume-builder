/**
 * AES-GCM encrypt / decrypt helpers.
 *
 * Format on the wire:
 *   { iv: 12 bytes random | ciphertext: arbitrary | tag: 16 bytes }
 * WebCrypto's AES-GCM appends the auth tag to the ciphertext output
 * automatically, so we only need to carry the IV alongside.
 *
 * Tampering with the ciphertext, the IV, or the associated data
 * causes decrypt to throw `OperationError`. We surface that as a
 * thrown error so callers cannot accidentally proceed with corrupt data.
 */

const IV_BYTES = 12; // AES-GCM standard

export interface EncryptedBlob {
  /** Base64url-encoded IV. */
  iv: string;
  /** Base64url-encoded ciphertext (with auth tag appended by WebCrypto). */
  ciphertext: string;
}

export async function encryptJson(value: unknown, key: CryptoKey): Promise<EncryptedBlob> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  return encryptBytes(plaintext, key);
}

export async function decryptJson<T = unknown>(blob: EncryptedBlob, key: CryptoKey): Promise<T> {
  const bytes = await decryptBytes(blob, key);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function encryptBytes(plaintext: Uint8Array, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );
  return {
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(ciphertext),
  };
}

export async function decryptBytes(blob: EncryptedBlob, key: CryptoKey): Promise<Uint8Array> {
  const iv = decodeBase64Url(blob.iv);
  const ciphertext = decodeBase64Url(blob.ciphertext);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plain);
}

// ---------------------------------------------------------------------------
// Base64URL — no padding, URL-safe alphabet. Picked over hex to keep
// payload sizes ~25% smaller without compromising JSON-friendliness.
// ---------------------------------------------------------------------------
export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
  const binary = typeof atob === 'function'
    ? atob(padded)
    : Buffer.from(padded, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
