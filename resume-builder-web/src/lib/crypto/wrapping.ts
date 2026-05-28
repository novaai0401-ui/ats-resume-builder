/**
 * Key wrapping — encrypts the raw data-encryption key (DEK) with a
 * key-encryption key (KEK) so the wrapped blob can be safely stored on
 * the server.
 *
 * WebCrypto's `wrapKey`/`unwrapKey` calls use AES-GCM internally,
 * producing an authenticated ciphertext we transport as base64url.
 */

import { encodeBase64Url, decodeBase64Url } from './aes-gcm';

const IV_BYTES = 12;

export interface WrappedKey {
  iv: string;
  ciphertext: string;
}

export async function wrapDataKey(dek: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv }),
  );
  return { iv: encodeBase64Url(iv), ciphertext: encodeBase64Url(wrapped) };
}

export async function unwrapDataKey(wrapped: WrappedKey, kek: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    decodeBase64Url(wrapped.ciphertext),
    kek,
    { name: 'AES-GCM', iv: decodeBase64Url(wrapped.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}
