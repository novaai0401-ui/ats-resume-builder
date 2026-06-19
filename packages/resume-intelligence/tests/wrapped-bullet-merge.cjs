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

// Direct unit on the post-pass helper with the exact founder screenshots.
{
  const { mergeWrappedHighlights } = require('../dist/index.js');

  // Dropped-ligature split: "...incomplete" + "elds in editable PDF..." (fields).
  const a = mergeWrappedHighlights([
    'Delivered a GenAI-based proof of concept for document analysis, integrating prompt-based AI APIs to identify missing or incomplete',
    'elds in editable PDF documents; the solution was recognized by management as a viable automation opportunity.',
  ]);
  assert.equal(a.length, 1, 'ligature split rejoined');
  assert.ok(/incomplete elds in editable PDF/.test(a[0]));

  // "non-functional" wrapped: "...requirements, non" + "functional requirements...".
  const b = mergeWrappedHighlights([
    'Drove UI design, and microfrontend adoption, while mentoring engineers and ensuring alignment between business requirements, non',
    'functional requirements, and long-term platform stability.',
  ]);
  assert.equal(b.length, 1, 'non-functional split rejoined');
  assert.ok(/requirements, non functional requirements/.test(b[0]));

  // Two complete, capitalized sentences stay separate.
  const c = mergeWrappedHighlights([
    'Owned frontend technical leadership for enterprise UI platforms.',
    'Built a backend-driven UI rule engine that cut release time in half.',
  ]);
  assert.equal(c.length, 2, 'complete sentences stay separate');
}

console.log('wrapped-bullet-merge: OK');
