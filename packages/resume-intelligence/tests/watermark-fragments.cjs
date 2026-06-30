const assert = require('node:assert/strict');
const test = require('node:test');
const { parseResumeText, stripWatermarkFragments, mapParsedResume } = require('../dist/index.js');

// Regression: a diagonal "CONFIDENTIAL" watermark in the source PDF is
// extracted by pdf-parse as repeated short ALL-CAPS fragment lines
// (CONFIDENTIAL / IDENTIAL / ENTIAL / CONFIDEN) that interleave into the
// resume body — polluting the Languages section and dropping stray bullets
// into Experience. They must be stripped before mapping.
//
// Mirrors the real file seema_almas_shaikhwatermarked.pdf where the
// watermark stamped ~3x lands right on the LANGUAGES section.

// Each watermark fragment repeats 3+ times across the doc, exactly like a
// page-repeated diagonal stamp (the real file stamps it ~8x).
const SAMPLE = [
  'SEEMA ALMAS SHAIKH',
  'Senior Engineer',
  'EXPERIENCE',
  'Senior Engineer, Acme Corp',
  '2020 - Present',
  'Built and shipped the payments platform.',
  'ENTIAL', 'IDENTIAL', 'CONFIDENTIAL', 'CONFIDEN',
  'Led a team of 6 engineers.',
  'ENTIAL', 'IDENTIAL', 'CONFIDENTIAL', 'CONFIDEN',
  'LANGUAGES',
  'English, Hindi, Marathi',
  'ENTIAL', 'IDENTIAL', 'CONFIDENTIAL', 'CONFIDEN',
].join('\n');

test('stripWatermarkFragments removes repeated ALL-CAPS stamp tokens, keeps real content', () => {
  const lines = SAMPLE.split('\n');
  const out = stripWatermarkFragments(lines);
  for (const junk of ['ENTIAL', 'IDENTIAL', 'CONFIDENTIAL', 'CONFIDEN']) {
    assert.ok(!out.includes(junk), `expected "${junk}" to be stripped`);
  }
  // Real content + section headings survive.
  assert.ok(out.includes('English, Hindi, Marathi'));
  assert.ok(out.includes('LANGUAGES'));
  assert.ok(out.includes('EXPERIENCE'));
  assert.ok(out.includes('Led a team of 6 engineers.'));
});

test('a token repeated only twice is NOT treated as a watermark', () => {
  const out = stripWatermarkFragments(['DRAFT', 'Real content here', 'DRAFT']);
  assert.ok(out.includes('DRAFT'), 'two occurrences should not trip the filter');
});

test('parsed Languages section is free of watermark fragments', () => {
  const parsed = parseResumeText(SAMPLE);
  const langLines = parsed.sections.languages || [];
  assert.ok(langLines.some((l) => /English/.test(l)));
  assert.ok(!langLines.join(' ').match(/CONFIDEN|ENTIAL|IDENTIAL/), 'no watermark fragments in languages');
});

test('mapped resume languages = only real human languages', () => {
  const parsed = parseResumeText(SAMPLE);
  const mapped = mapParsedResume(parsed);
  const langs = (mapped.languages || []).map((l) => String(l).toLowerCase());
  assert.deepEqual(langs.sort(), ['english', 'hindi', 'marathi'].sort());
});
