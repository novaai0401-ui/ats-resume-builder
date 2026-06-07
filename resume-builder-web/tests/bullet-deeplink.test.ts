import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAddKeywordLink,
  parseAddKeyword,
  sanitizeKeyword,
} from '../src/lib/bullet-deeplink';

test('buildAddKeywordLink encodes the keyword and resume id', () => {
  const url = buildAddKeywordLink('terraform', 'abc123');
  assert.ok(url.startsWith('/resume?'));
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('id'), 'abc123');
  assert.equal(params.get('addKeyword'), 'terraform');
});

test('buildAddKeywordLink omits id when not provided', () => {
  const url = buildAddKeywordLink('react native');
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('id'), null);
  assert.equal(params.get('addKeyword'), 'react native');
});

test('buildAddKeywordLink returns empty string for blank keyword', () => {
  assert.equal(buildAddKeywordLink('   '), '');
  assert.equal(buildAddKeywordLink(''), '');
});

test('sanitizeKeyword keeps technical punctuation', () => {
  assert.equal(sanitizeKeyword('c++'), 'c++');
  assert.equal(sanitizeKeyword('node.js'), 'node.js');
  assert.equal(sanitizeKeyword('ci/cd'), 'ci/cd');
  assert.equal(sanitizeKeyword('c#'), 'c#');
});

test('sanitizeKeyword collapses whitespace and trims', () => {
  assert.equal(sanitizeKeyword('  react   native  '), 'react native');
});

test('sanitizeKeyword strips angle brackets (markup guard)', () => {
  assert.equal(sanitizeKeyword('<script>aws'), 'script aws');
});

test('sanitizeKeyword caps length at 60', () => {
  const long = 'a'.repeat(80);
  assert.equal(sanitizeKeyword(long).length, 60);
});

test('parseAddKeyword returns null for empty and sanitizes otherwise', () => {
  assert.equal(parseAddKeyword(null), null);
  assert.equal(parseAddKeyword(''), null);
  assert.equal(parseAddKeyword('  '), null);
  assert.equal(parseAddKeyword(' kubernetes '), 'kubernetes');
});

test('round-trip: a built link parses back to the same keyword', () => {
  const url = buildAddKeywordLink('graphql', 'r1');
  const value = new URLSearchParams(url.split('?')[1]).get('addKeyword');
  assert.equal(parseAddKeyword(value), 'graphql');
});
