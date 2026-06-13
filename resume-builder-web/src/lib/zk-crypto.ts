/**
 * Zero-knowledge encryption for resume content.
 *
 * The pragmatic alternative to full local-first: instead of trusting our
 * servers with plaintext, the user can encrypt a resume into a portable blob
 * with a passphrase only they know. We (and anyone who steals the blob) can
 * never read it without that passphrase — AES-256-GCM with a PBKDF2-derived
 * key. This is the building block for encrypted backups today and
 * encrypted-at-rest server storage next.
 *
 * Uses the Web Crypto API (`crypto.subtle`), available in browsers and in
 * Node 20+ (so this module unit-tests without a DOM).
 */

export const ZK_BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface ZkEnvelope {
  v: number;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string; // base64
  iv: string;   // base64
  ct: string;   // base64 (ciphertext + GCM tag)
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('Web Crypto is not available in this environment.');
  return c.subtle;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt any JSON-serializable value into a portable envelope string. */
export async function encryptBackup(data: unknown, passphrase: string): Promise<string> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }
  const subtle = getSubtle();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource));
  const envelope: ZkEnvelope = {
    v: ZK_BACKUP_VERSION,
    kdf: 'PBKDF2-SHA256',
    iter: PBKDF2_ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(ct),
  };
  return JSON.stringify(envelope);
}

/** Decrypt an envelope string back into the original value. Throws on a wrong
 *  passphrase or tampered data (AES-GCM authentication failure). */
export async function decryptBackup<T = unknown>(envelopeStr: string, passphrase: string): Promise<T> {
  let env: ZkEnvelope;
  try {
    env = JSON.parse(envelopeStr) as ZkEnvelope;
  } catch {
    throw new Error('This is not a valid backup file.');
  }
  if (!env || env.v !== ZK_BACKUP_VERSION || env.kdf !== 'PBKDF2-SHA256') {
    throw new Error('Unsupported or corrupt backup file.');
  }
  const subtle = getSubtle();
  const salt = b64ToBytes(env.salt);
  const iv = b64ToBytes(env.iv);
  const ct = b64ToBytes(env.ct);
  const key = await deriveKey(passphrase, salt, env.iter || PBKDF2_ITERATIONS);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  } catch {
    throw new Error('Wrong passphrase, or the backup file has been altered.');
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
