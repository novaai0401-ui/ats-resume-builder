const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for the "0 languages after upload" bug.
//
// The API's create / update / duplicate paths call resolveSkillCategories
// to derive the final language list. Without `languages:` in the input,
// the resolver re-derives languages purely from skill heuristics —
// dropping any language extracted from a real LANGUAGES section in
// the resume. Symptom: editor shows "0 languages" after upload even
// though extraction + sanitiser preserved them.
//
// This test asserts the call-site invariant by scanning the actual
// service source, so a future refactor that strips the `languages:`
// field from any call site cannot ship without breaking CI.

const SERVICE_PATH = path.resolve(__dirname, '..', 'src', 'resume', 'resume.service.ts');

test('every resolveSkillCategories call in resume.service.ts forwards languages', () => {
  const src = fs.readFileSync(SERVICE_PATH, 'utf8');
  const callSites = src.match(/const categories = resolveSkillCategories\(\{[\s\S]*?\}\);/g) || [];
  assert.ok(callSites.length >= 3,
    `expected >=3 call sites (create/update/duplicate), found ${callSites.length}`);
  for (let i = 0; i < callSites.length; i++) {
    const site = callSites[i];
    assert.match(
      site,
      /\blanguages\s*:/,
      `call site #${i + 1} is missing the "languages:" field — that's the "0 languages after upload" bug.\nSnippet:\n${site}`,
    );
  }
});

test('resolveSkillCategories actually uses the explicit languages input (not just heuristics)', () => {
  // Defence in depth — exercise the resolver itself. If someone
  // ever rewrites it to ignore the explicit `languages` parameter,
  // the languages we pass from upload would be silently lost.
  const src = fs.readFileSync(SERVICE_PATH, 'utf8');
  // Grab the function body.
  const fnMatch = src.match(/function resolveSkillCategories\(input:[\s\S]*?\n\}\n/);
  assert.ok(fnMatch, 'could not locate resolveSkillCategories function');
  const body = fnMatch[0];
  // It must reference `input.languages` at least once — otherwise the
  // input is being ignored.
  assert.match(
    body,
    /input\.languages/,
    'resolveSkillCategories no longer reads input.languages — uploaded languages will be silently dropped.',
  );
});
