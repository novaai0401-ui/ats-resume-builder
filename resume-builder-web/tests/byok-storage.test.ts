import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BYOK_PROVIDERS,
  clearByokKey,
  getByokHeader,
  isPaidPlan,
  loadByokKey,
  maskedKey,
  saveByokKey,
  validateKeyShape,
  type ByokKeyRecord,
} from '../src/lib/byok-storage';

// In-memory shim for window.localStorage so the helper exercises its
// browser path under node:test. The real implementation gates every
// write on `typeof window !== 'undefined'` so we just install a
// minimal stub before each test.
function installLocalStorageShim() {
  const store = new Map<string, string>();
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    },
  };
  return store;
}

function uninstall() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

// --------------------------------------------------------------------
// validateKeyShape — first line of defence before we even save
// --------------------------------------------------------------------

test('rejects empty / whitespace-only key', () => {
  const r = validateKeyShape('groq', '   ');
  assert.equal(r.ok, false);
  assert.match(r.reason, /Paste your API key/);
});

test('rejects a key that is way too short', () => {
  const r = validateKeyShape('groq', 'gsk_short');
  assert.equal(r.ok, false);
  assert.match(r.reason, /too short/i);
});

test('rejects a key with the wrong provider prefix', () => {
  const r = validateKeyShape('openai', 'gsk_1234567890abcdef1234567890abcdef1234567890');
  assert.equal(r.ok, false);
  assert.match(r.reason, /sk-/);
});

test('rejects a key with INNER whitespace or quotes (paste mistake)', () => {
  // Trailing whitespace is fine — we trim it. But inner whitespace
  // ("Bearer gsk_xxx" — user copied the curl header too) and
  // surrounding quotes are real paste mistakes that should be flagged.
  const inner = validateKeyShape('groq', 'gsk_1234567890abcdef1234 567890abcdef1234567890');
  assert.equal(inner.ok, false);
  const q = validateKeyShape('groq', '"gsk_1234567890abcdef1234567890abcdef12345678"');
  assert.equal(q.ok, false);
});

test('accepts a well-formed Groq key', () => {
  const r = validateKeyShape('groq', 'gsk_' + 'a'.repeat(50));
  assert.equal(r.ok, true);
});

test('accepts a well-formed Anthropic key (sk-ant prefix)', () => {
  const r = validateKeyShape('anthropic', 'sk-ant-' + 'x'.repeat(50));
  assert.equal(r.ok, true);
});

// --------------------------------------------------------------------
// Round-trip + storage discipline
// --------------------------------------------------------------------

test('save → load round-trips the same record', () => {
  installLocalStorageShim();
  try {
    saveByokKey('groq', 'gsk_' + 'a'.repeat(50));
    const loaded = loadByokKey() as ByokKeyRecord;
    assert.equal(loaded.provider, 'groq');
    assert.equal(loaded.apiKey.startsWith('gsk_'), true);
    assert.match(loaded.addedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    uninstall();
  }
});

test('clearByokKey removes the record', () => {
  installLocalStorageShim();
  try {
    saveByokKey('groq', 'gsk_' + 'a'.repeat(50));
    clearByokKey();
    assert.equal(loadByokKey(), null);
  } finally {
    uninstall();
  }
});

test('saveByokKey throws on invalid shape — never silently stores junk', () => {
  installLocalStorageShim();
  try {
    assert.throws(() => saveByokKey('groq', 'too-short'), /too short/i);
    // Storage must remain empty after the failed save.
    assert.equal(loadByokKey(), null);
  } finally {
    uninstall();
  }
});

test('loadByokKey returns null when storage is empty or corrupted', () => {
  const store = installLocalStorageShim();
  try {
    assert.equal(loadByokKey(), null);
    store.set('rb_user_ai_key', '{not valid json');
    assert.equal(loadByokKey(), null);
    store.set('rb_user_ai_key', JSON.stringify({ provider: 'fake', apiKey: 'x' }));
    assert.equal(loadByokKey(), null, 'unknown provider must be rejected');
  } finally {
    uninstall();
  }
});

// --------------------------------------------------------------------
// Plan gating — the BYOK card must hide for paid users
// --------------------------------------------------------------------

test('isPaidPlan recognises STUDENT and PRO (any case), nothing else', () => {
  assert.equal(isPaidPlan('FREE'), false);
  assert.equal(isPaidPlan(''), false);
  assert.equal(isPaidPlan(null), false);
  assert.equal(isPaidPlan(undefined), false);
  assert.equal(isPaidPlan('STUDENT'), true);
  assert.equal(isPaidPlan('Student'), true, 'must be case-insensitive');
  assert.equal(isPaidPlan('PRO'), true);
  assert.equal(isPaidPlan('Pro'), true);
  assert.equal(isPaidPlan('UNKNOWN'), false);
});

// --------------------------------------------------------------------
// Header attachment — the privacy contract
// --------------------------------------------------------------------

test('getByokHeader returns null when no key stored — no headers sent', () => {
  installLocalStorageShim();
  try {
    assert.equal(getByokHeader(), null);
  } finally {
    uninstall();
  }
});

test('getByokHeader includes provider name AND key on AI requests', () => {
  installLocalStorageShim();
  try {
    saveByokKey('openai', 'sk-' + 'x'.repeat(50));
    const hdr = getByokHeader();
    assert.ok(hdr);
    assert.equal(hdr!['X-User-AI-Provider'], 'openai');
    assert.match(hdr!['X-User-AI-Key'], /^sk-/);
  } finally {
    uninstall();
  }
});

// --------------------------------------------------------------------
// maskedKey — UI must never display the full key
// --------------------------------------------------------------------

test('maskedKey shows only first 4 / last 4 chars', () => {
  const rec: ByokKeyRecord = {
    provider: 'groq',
    apiKey: 'gsk_abcdef1234567890wxyz',
    addedAt: new Date().toISOString(),
  };
  const m = maskedKey(rec);
  assert.equal(m.startsWith('gsk_'), true);
  assert.equal(m.endsWith('wxyz'), true);
  assert.equal(m.includes('abcdef1234567890'), false, 'middle must be masked');
});

test('maskedKey handles null + short keys safely', () => {
  assert.equal(maskedKey(null), '');
  const short = maskedKey({ provider: 'groq', apiKey: 'abc', addedAt: '' });
  assert.equal(short, '••••');
});

// --------------------------------------------------------------------
// Sanity: the provider list the UI iterates over is the same one the
// server-side factory accepts.
// --------------------------------------------------------------------

test('BYOK_PROVIDERS lists exactly the three supported providers', () => {
  assert.deepEqual([...BYOK_PROVIDERS].sort(), ['anthropic', 'groq', 'openai']);
});
