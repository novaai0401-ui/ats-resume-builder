import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureFirstTouch,
  readFirstTouch,
  acquisitionProperties,
  sanitizeUtmValue,
  clearFirstTouch,
} from '@/src/lib/acquisition';

/**
 * R-110 — MCP links have always appended ?utm_source=…, and nothing read
 * it. A URL tag with no reader is not attribution.
 */

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

test('captures utm_source from the landing URL', () => {
  const store = memoryStorage();
  const touch = captureFirstTouch(new URLSearchParams('utm_source=ai-assistant'), '/resume', store);

  assert.equal(touch?.source, 'ai-assistant');
  assert.equal(touch?.landingPath, '/resume');
  assert.equal(readFirstTouch(store)?.source, 'ai-assistant');
});

test('FIRST touch wins — a later visit does not overwrite it', () => {
  const store = memoryStorage();
  captureFirstTouch(new URLSearchParams('utm_source=chatgpt'), '/', store);
  captureFirstTouch(new URLSearchParams('utm_source=google'), '/pricing', store);

  assert.equal(readFirstTouch(store)?.source, 'chatgpt', 'the platform that actually sent them keeps credit');
});

test('conversion events can attach attribution unconditionally', () => {
  const store = memoryStorage();
  assert.deepEqual(acquisitionProperties(store), {}, 'an unattributed visit adds nothing');

  captureFirstTouch(new URLSearchParams('utm_source=claude&utm_medium=connector'), '/resume/start', store);
  const props = acquisitionProperties(store);
  assert.equal(props.acquisitionSource, 'claude');
  assert.equal(props.acquisitionMedium, 'connector');
  assert.equal(props.acquisitionLandingPath, '/resume/start');
});

test('only the path is stored, never the query string', () => {
  // A query can carry whatever the user typed; attribution does not need it.
  const store = memoryStorage();
  const touch = captureFirstTouch(
    new URLSearchParams('utm_source=ai-assistant'),
    '/jd-match?jd=my%20secret%20employer',
    store,
  );
  assert.equal(touch?.landingPath, '/jd-match');
  assert.doesNotMatch(JSON.stringify(readFirstTouch(store)), /secret/);
});

test('junk sources are rejected rather than stored', () => {
  assert.equal(sanitizeUtmValue('<script>alert(1)</script>'), '');
  assert.equal(sanitizeUtmValue('a'.repeat(200)), '');
  assert.equal(sanitizeUtmValue(null), '');
  assert.equal(sanitizeUtmValue('  ChatGPT  '), 'chatgpt');

  const store = memoryStorage();
  assert.equal(captureFirstTouch(new URLSearchParams('utm_source=<bad>'), '/', store), null);
  assert.equal(readFirstTouch(store), null);
});

test('a visit with no utm tag records nothing', () => {
  const store = memoryStorage();
  assert.equal(captureFirstTouch(new URLSearchParams(''), '/', store), null);
  assert.deepEqual(acquisitionProperties(store), {});
});

test('a corrupt stored entry reads as no attribution', () => {
  const store = memoryStorage();
  store.setItem('rb_acquisition_first_touch', '{not json');
  assert.equal(readFirstTouch(store), null);

  clearFirstTouch(store);
  assert.equal(readFirstTouch(store), null);
});

test('blocked storage never throws', () => {
  const blocked = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  assert.equal(captureFirstTouch(new URLSearchParams('utm_source=x'), '/', blocked), null);
  assert.equal(readFirstTouch(blocked), null);
  assert.deepEqual(acquisitionProperties(blocked), {});
});
