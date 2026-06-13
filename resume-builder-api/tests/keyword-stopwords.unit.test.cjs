const assert = require('node:assert/strict');
const test = require('node:test');
const {
  JD_STOPWORDS,
  SECTION_LABEL_WORDS,
  isJdStopword,
  filterJdKeywords,
} = require('../dist/lib/keyword-stopwords.js');

/**
 * R-X (smoke cycle 2) — every "missing keywords" surface (ATS scorer,
 * AI critique fallback, tech-gap rule-based, public /v1/score) must
 * filter through filterJdKeywords. The founder's smoke screenshots
 * surfaced this surface twice with different garbage outputs:
 *   - ATS Review: "have, systems, distributed, understand, how, …"
 *   - Tech Gap:   "+ you + were + past + worked + following + real"
 * because each path had its OWN tokenizer with its OWN (under-sized
 * or empty) stopword list. Now there is one list shared everywhere.
 */

test('rejects the exact filler words the founder saw in production', () => {
  // From the AI Critique smoke screenshot.
  for (const word of ['have', 'understand', 'how', 'experienced', 'experience']) {
    assert.ok(isJdStopword(word), `${word} must be rejected`);
  }
  // From the Tech Gap smoke screenshot.
  for (const word of ['you', 'were', 'past', 'worked', 'following', 'real']) {
    assert.ok(isJdStopword(word), `${word} must be rejected`);
  }
});

test('section-label words ("skills", "experience" noun) are filtered too', () => {
  // The most embarrassing failure mode: showing "skills" as a
  // "missing skill" in the AI Critique.
  for (const word of [
    'skills', 'skill', 'experience', 'education', 'projects',
    'certifications', 'languages', 'summary', 'objective',
  ]) {
    assert.ok(SECTION_LABEL_WORDS.has(word), `${word} must be a section label`);
    assert.ok(isJdStopword(word), `${word} must be rejected by isJdStopword`);
  }
});

test('legitimate role/skill nouns survive', () => {
  // The whole POINT of the filter is to keep these around. If any of
  // these ever land in JD_STOPWORDS / SECTION_LABEL_WORDS we have a
  // regression that hides real signal.
  for (const word of [
    'react', 'typescript', 'kubernetes', 'postgres', 'mongodb',
    'leadership', 'frontend', 'backend', 'distributed', 'systems',
    'reliability', 'architecture', 'agile', 'cicd', 'graphql',
  ]) {
    assert.ok(!isJdStopword(word), `${word} must NOT be rejected`);
  }
});

test('filterJdKeywords dedupes and normalises case', () => {
  // Two paths feed this: the ATS scorer (lowercase tokens already)
  // and the tech-gap fallback (lowercase tokens already). Make sure
  // duplicate keys from different sources collapse and casing is
  // canonical so the UI doesn't show "React, react, REACT".
  const out = filterJdKeywords(['React', 'react', 'TYPESCRIPT', 'typescript', 'have', 'systems']);
  assert.deepEqual(out, ['react', 'typescript', 'systems']);
});

test('filterJdKeywords drops <3-char tokens (noise floor)', () => {
  // "go" is a tricky one — it IS a real language. But at the
  // current 3-char floor we accept this false negative because the
  // false-positive risk ("an", "is", "or", "in" surfacing as
  // missing keywords) is bigger. When we add language-specific
  // tokenisation we revisit this.
  assert.deepEqual(filterJdKeywords(['a', 'an', 'in', 'is']), []);
});

test('JD_STOPWORDS covers the dirty-dozen verb forms', () => {
  // Every conjugation of the auxiliaries — "have/has/had/having",
  // "be/is/was/were/been/being", "do/does/did/doing/done" — must be
  // covered, or the same root word leaks through in a different
  // tense.
  for (const word of ['have', 'has', 'had', 'having']) assert.ok(JD_STOPWORDS.has(word));
  for (const word of ['be', 'is', 'was', 'were', 'been', 'being']) assert.ok(JD_STOPWORDS.has(word));
  for (const word of ['do', 'does', 'did', 'doing', 'done']) assert.ok(JD_STOPWORDS.has(word));
});
