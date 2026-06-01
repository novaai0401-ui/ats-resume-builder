const assert = require('node:assert/strict');
const test = require('node:test');

const { assignSplit, previewSplit } = require('../dist/training-dataset/split-assignment.js');
const { serializeJsonl, toExportLine } = require('../dist/training-dataset/jsonl-export.js');
const { buildStructuredLabel, isLabelHighEnoughQuality } = require('../dist/training-dataset/auto-labeler.js');

// ---------------------------------------------------------------------------
// split-assignment
// ---------------------------------------------------------------------------

test('assignSplit returns one of the three groups', () => {
  const g = assignSplit('any-id', 'pdf');
  assert.ok(['train', 'val', 'test'].includes(g));
});

test('assignSplit is deterministic for same input', () => {
  const a = assignSplit('sample-xyz', 'pdf');
  const b = assignSplit('sample-xyz', 'pdf');
  assert.equal(a, b);
});

test('assignSplit differs across formats for same id (stratification)', () => {
  // Not all id+format pairs will differ, but across 200 ids we expect
  // the assignments NOT to be identical between formats.
  let diffs = 0;
  for (let i = 0; i < 200; i++) {
    if (assignSplit(`id-${i}`, 'pdf') !== assignSplit(`id-${i}`, 'docx')) diffs += 1;
  }
  assert.ok(diffs > 0, 'expected some divergence between formats');
});

test('previewSplit roughly hits the 80/10/10 ratio on 1000 samples', () => {
  const rows = [];
  for (let i = 0; i < 1000; i++) rows.push({ id: `s${i}`, sourceFileType: 'pdf' });
  const counts = previewSplit(rows);
  const total = counts.train + counts.val + counts.test;
  assert.equal(total, 1000);
  // Allow generous tolerance — 1000 samples is small.
  assert.ok(counts.train > 740 && counts.train < 860, `train=${counts.train}`);
  assert.ok(counts.val > 70 && counts.val < 130, `val=${counts.val}`);
  assert.ok(counts.test > 70 && counts.test < 130, `test=${counts.test}`);
});

// ---------------------------------------------------------------------------
// jsonl-export
// ---------------------------------------------------------------------------

test('toExportLine maps snake_case fields and nulls missing labels', () => {
  const line = toExportLine({
    id: 'ts_1',
    splitGroup: 'val',
    sourceFileType: 'pdf',
    redactedText: 'hello',
    structuredLabel: null,
    layoutHints: null,
  });
  assert.equal(line.id, 'ts_1');
  assert.equal(line.split, 'val');
  assert.equal(line.source_format, 'pdf');
  assert.equal(line.labels, null);
});

test('serializeJsonl produces one JSON object per line ending in newline', () => {
  const out = serializeJsonl([
    { id: 'a', splitGroup: 'train', sourceFileType: 'pdf', redactedText: 't1', structuredLabel: { x: 1 }, layoutHints: null },
    { id: 'b', splitGroup: 'val', sourceFileType: 'docx', redactedText: 't2', structuredLabel: null, layoutHints: null },
  ]);
  const lines = out.split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  for (const line of lines) JSON.parse(line); // must parse
  assert.ok(out.endsWith('\n'));
});

test('serializeJsonl returns empty string for empty iterable', () => {
  assert.equal(serializeJsonl([]), '');
});

// ---------------------------------------------------------------------------
// auto-labeler
// ---------------------------------------------------------------------------

test('buildStructuredLabel keeps only non-empty fields', () => {
  const out = buildStructuredLabel({
    contact: { fullName: 'Jane', email: '', phone: '+1 555', location: '  ' },
    summary: '   ',
    skills: ['React', '', '   ', 'TypeScript', 'React'],
    experience: [
      { role: 'Engineer', company: 'Acme', startDate: '2020', endDate: '2024', highlights: ['Built a thing', 'a'] },
    ],
    education: [{ degree: 'B.S.', institution: 'University' }],
    projects: [],
    certifications: [{ name: '' }],
  });

  assert.equal(out.contact.fullName, 'Jane');
  assert.equal(out.contact.email, undefined);
  assert.equal(out.contact.phone, '+1 555');
  assert.equal(out.summary, undefined);
  // dedup + filter empty
  assert.deepEqual(out.skills, ['React', 'TypeScript']);
  // experience highlights below MIN_BULLET_LEN dropped
  assert.equal(out.experience.length, 1);
  assert.deepEqual(out.experience[0].highlights, ['Built a thing']);
  assert.equal(out.projects, undefined);
  assert.equal(out.certifications, undefined);
});

test('buildStructuredLabel drops experience entries without role or company', () => {
  const out = buildStructuredLabel({
    experience: [
      { role: '', company: '', startDate: '2020' },
      { role: 'Engineer', company: 'Acme' },
    ],
  });
  assert.equal(out.experience.length, 1);
  assert.equal(out.experience[0].role, 'Engineer');
});

test('isLabelHighEnoughQuality requires contact + (exp OR edu)', () => {
  assert.equal(isLabelHighEnoughQuality({}), false);
  assert.equal(isLabelHighEnoughQuality({ contact: { fullName: 'X' } }), false);
  assert.equal(isLabelHighEnoughQuality({ contact: { fullName: 'X' }, experience: [{ role: 'r' }] }), true);
  assert.equal(isLabelHighEnoughQuality({ contact: { fullName: 'X' }, education: [{ degree: 'd' }] }), true);
  // experience present but empty array — should fail
  assert.equal(isLabelHighEnoughQuality({ contact: { fullName: 'X' }, experience: [] }), false);
});
