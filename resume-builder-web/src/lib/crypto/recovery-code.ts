/**
 * Recovery code — the second wrapping for the data-encryption key.
 *
 * Generated once at setup, shown to the user, never stored in plaintext
 * by us. If the user loses their passphrase, the recovery code can
 * unwrap the same DEK so they can set a new passphrase without losing
 * data.
 *
 * Encoding: 24 base32 characters, dashed every 4 ({4}-{4}-{4}-{4}-{4}-{4}).
 * That is 120 bits of entropy — well past anything brute-forceable at
 * PBKDF2-600k cost.
 *
 * We use the Crockford base32 alphabet (no I, L, O, U) so users can
 * write codes down without misreading characters.
 */

import { randomBytes } from './key-derivation';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const CODE_LENGTH = 24;

export interface RecoveryCode {
  /** Human-facing string with dashes, e.g. "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01". */
  formatted: string;
  /** Canonical form without dashes, uppercase. Used as KDF input. */
  canonical: string;
}

export function generateRecoveryCode(): RecoveryCode {
  const bytes = randomBytes(15); // 15 bytes = 120 bits, fits 24 base32 chars
  let canonical = '';
  let bitBuf = 0;
  let bitCount = 0;
  for (let i = 0; i < bytes.length && canonical.length < CODE_LENGTH; i++) {
    bitBuf = (bitBuf << 8) | bytes[i];
    bitCount += 8;
    while (bitCount >= 5 && canonical.length < CODE_LENGTH) {
      const idx = (bitBuf >> (bitCount - 5)) & 0x1f;
      canonical += ALPHABET[idx];
      bitCount -= 5;
    }
  }
  return { canonical, formatted: addDashes(canonical) };
}

/**
 * Normalize whatever the user typed back into the canonical form so we
 * can re-derive the recovery KEK. Accepts lowercase, accepts dashes or
 * spaces, accepts common look-alikes (I→1, L→1, O→0, U→V) — all per
 * Crockford rules.
 */
export function normalizeRecoveryCode(input: string): string {
  const upper = String(input || '').toUpperCase().replace(/[-\s]/g, '');
  return upper
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

export function isValidRecoveryCodeShape(input: string): boolean {
  const canonical = normalizeRecoveryCode(input);
  if (canonical.length !== CODE_LENGTH) return false;
  for (const ch of canonical) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

function addDashes(canonical: string): string {
  return canonical.match(/.{1,4}/g)?.join('-') ?? canonical;
}
