const assert = require('node:assert/strict');
const test = require('node:test');
const { parseTailorResponse } = require('../dist/ai/tailor.service.js');

/**
 * R-034 tailor-proposal parser tests.
 *
 * The LLM's response is untrusted input that drives writes into the
 * user's resume version. parseTailorResponse is the validation
 * boundary: anything that survives it will be shown in the diff UI
 * and may be applied. These tests pin the rejection rules.
 */

const catalog = [
  { experienceIndex: 0, bulletIndex: 0, text: 'Reduced page load by 45%' },
  { experienceIndex: 0, bulletIndex: 1, text: 'Led migration to micro-frontends' },
  { experienceIndex: 1, bulletIndex: 0, text: 'Built CI pipeline' },
];

test('parses a clean response into validated changes', () => {
  const raw = JSON.stringify({
    summary: 'New tailored summary.',
    bullets: [
      { id: 0, after: 'Drove a 45% page-load reduction across React apps' },
      { id: 2, after: 'Built and owned the CI/CD pipeline for 4 teams' },
    ],
    skillsToAdd: ['Design Systems', 'CI/CD'],
  });
  const out = parseTailorResponse(raw, catalog);
  assert.equal(out.summary, 'New tailored summary.');
  assert.equal(out.bullets.length, 2);
  assert.deepEqual(out.bullets[0], {
    experienceIndex: 0,
    bulletIndex: 0,
    before: 'Reduced page load by 45%',
    after: 'Drove a 45% page-load reduction across React apps',
  });
  assert.deepEqual(out.skillsToAdd, ['Design Systems', 'CI/CD']);
});

test('drops out-of-range bullet ids (LLM hallucinated an id)', () => {
  const raw = JSON.stringify({
    summary: '',
    bullets: [
      { id: 99, after: 'Hallucinated change' },
      { id: -1, after: 'Negative id' },
      { id: 1, after: 'Spearheaded the micro-frontend migration' },
    ],
    skillsToAdd: [],
  });
  const out = parseTailorResponse(raw, catalog);
  assert.equal(out.bullets.length, 1);
  assert.equal(out.bullets[0].bulletIndex, 1);
});

test('drops no-op rewrites identical to the original', () => {
  const raw = JSON.stringify({
    summary: '',
    bullets: [{ id: 0, after: 'Reduced page load by 45%' }],
    skillsToAdd: [],
  });
  const out = parseTailorResponse(raw, catalog);
  assert.equal(out.bullets.length, 0);
});

test('survives markdown-fenced JSON (LLM ignored the no-markdown rule)', () => {
  const raw = '```json\n' + JSON.stringify({
    summary: 'S',
    bullets: [{ id: 0, after: 'Better bullet' }],
    skillsToAdd: [],
  }) + '\n```';
  const out = parseTailorResponse(raw, catalog);
  assert.equal(out.bullets.length, 1);
  assert.equal(out.summary, 'S');
});

test('returns empty on garbage / non-JSON / empty input', () => {
  for (const raw of ['', 'not json at all', '[1,2,3]', '{"bullets": "nope"}']) {
    const out = parseTailorResponse(raw, catalog);
    assert.equal(out.bullets.length, 0, `raw=${JSON.stringify(raw)}`);
    assert.deepEqual(out.skillsToAdd, []);
  }
});

test('caps skillsToAdd at 20 and drops empties', () => {
  const raw = JSON.stringify({
    summary: '',
    bullets: [],
    skillsToAdd: [...Array(30).keys()].map((i) => `Skill${i}`).concat(['', '  ']),
  });
  const out = parseTailorResponse(raw, catalog);
  assert.equal(out.skillsToAdd.length, 20);
});
