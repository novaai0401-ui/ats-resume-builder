const assert = require('node:assert/strict');
const { mapParsedResume, parseResumeText } = require('../dist/index.js');

function mapResume(text) {
  return mapParsedResume(parseResumeText(text));
}

// Reproduces the founder-reported bug: a PDF wraps one logical bullet across
// lines, and the wrapped tail (lowercase / connector continuation) was being
// stored as its own fragment — which then tripped the editor's "start with a
// strong action verb" warning. The mapper must re-join wrapped fragments so
// each highlight is a complete sentence.
{
  const mapped = mapResume(`
Chandan Kumar

Experience
Senior Engineer @ Acme Corp | Jan 2021 - Present
- Initiated and delivered a React-Redux modernization program for a legacy enterprise application, significantly improving runtime
- performance and application stability while achieving zero production defects, an outcome formally appreciated by senior leadership.
- Implemented client-side caching strategies as part of the Redux upgrade, reducing redundant API calls and materially improving UI
- responsiveness in high-traffic and business-critical workflows.
`);

  assert.equal(mapped.experience.length, 1, 'one experience block');
  const highlights = mapped.experience[0].highlights;

  // No highlight should be a wrapped fragment starting lowercase.
  for (const h of highlights) {
    assert.ok(!/^[a-z]/.test(h.trim()), `fragment leaked as its own bullet: "${h}"`);
  }

  // The two logical bullets should be rejoined into complete sentences.
  const joinedRuntime = highlights.find((h) => /improving runtime performance and application stability/.test(h));
  assert.ok(joinedRuntime, 'runtime bullet rejoined into one sentence');
  assert.ok(/senior leadership\.?$/.test(joinedRuntime.trim()), 'rejoined bullet keeps its tail');

  const joinedCaching = highlights.find((h) => /improving UI responsiveness in high-traffic/.test(h));
  assert.ok(joinedCaching, 'caching bullet rejoined into one sentence');
}

// Guard: genuinely separate bullets (each a capitalized, complete thought) must
// NOT be merged.
{
  const mapped = mapResume(`
Jane Doe

Experience
Lead @ Globex | 2020 - 2022
- Led the migration from a monolith to microservices across three teams.
- Designed a backend-driven UI rule engine that cut release time in half.
`);
  const highlights = mapped.experience[0].highlights;
  assert.equal(highlights.length, 2, 'separate complete bullets stay separate');
}

console.log('wrapped-bullet-merge: OK');
