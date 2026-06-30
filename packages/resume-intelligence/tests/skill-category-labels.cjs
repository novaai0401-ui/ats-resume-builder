const assert = require('node:assert/strict');
const test = require('node:test');
const { parseResumeText, mapParsedResume } = require('../dist/index.js');

// Additive: skills grouped under category sub-labels ("Frontend: HTML, CSS",
// "Backend: Node.js") must not yield a first token like "Frontend: HTML".
// The category label is stripped; the real skills survive.

const SAMPLE = [
  'Muskan Gupta',
  'SKILLS',
  'Frontend: HTML, CSS, JavaScript, React',
  'Backend: Node.js, Express, Java',
  'Databases: MySQL, MongoDB',
].join('\n');

test('category sub-labels are stripped from skills', () => {
  const mapped = mapParsedResume(parseResumeText(SAMPLE));
  const skills = (mapped.skills || []).map((s) => s.toLowerCase());
  // No token still carries a category prefix.
  for (const s of skills) {
    assert.ok(!/^(frontend|backend|databases?|tools|languages?)\s*:/.test(s), `leaked label in "${s}"`);
  }
  // Real skills are present and clean.
  assert.ok(skills.includes('html'), 'HTML present');
  assert.ok(skills.includes('node.js') || skills.includes('nodejs'), 'Node.js present');
  assert.ok(skills.includes('mysql'), 'MySQL present');
});
