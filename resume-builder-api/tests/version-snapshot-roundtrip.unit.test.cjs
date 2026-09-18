const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  SNAPSHOT_FIELDS,
  SNAPSHOT_EXCLUDED_FIELDS,
  buildSnapshotPayload,
  applySnapshot,
} = require('../dist/resume/resume-snapshot.js');

/**
 * R-108 regression. The snapshot payload was built by hand in two places
 * and both lists were incomplete: achievements, licenses, publications and
 * every design setting (templateId aside) were dropped. Restoring a
 * version therefore deleted content, and a tailored version — the one
 * log_application attributes outcomes to — was not the document the user
 * had reviewed. C-007 says that link must stay intact.
 */

/** A resume with every column populated with a distinguishable value. */
const FULL_RESUME = {
  id: 'r1',
  userId: 'u1',
  title: 'Staff Engineer Resume',
  contact: { fullName: 'A. Candidate', email: 'a@example.com', phone: '+91 90000 00000' },
  summary: 'Ten years building payments infrastructure. Cut settlement time 40%.',
  skills: ['Go', 'Postgres', 'Kafka'],
  languages: ['English', 'Hindi'],
  experience: [{ role: 'Staff Engineer', company: 'Acme', startDate: 'Jan 2020', endDate: 'Present', highlights: ['Led migration'] }],
  education: [{ degree: 'B.Tech', institution: 'IIT', startDate: '2012', endDate: '2016' }],
  projects: [{ name: 'Ledger rewrite', highlights: ['Halved reconciliation time'] }],
  certifications: [{ name: 'CKA', issuer: 'CNCF' }],
  licenses: [{ name: 'PE License', issuer: 'State Board', number: 'PE-4471' }],
  publications: [{ title: 'Idempotent payments', publisher: 'ACM Queue', date: '2023' }],
  achievements: ['Patent US-123456'],
  templateId: 'ats-classic',
  fontFamily: 'Inter',
  density: 'compact',
  accentColor: '#4f46e5',
  sectionOrder: ['summary', 'experience', 'skills'],
  photoUrl: null,
  aiAssistUsed: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-01'),
};

test('a snapshot round-trips every field it covers', () => {
  const snapshot = buildSnapshotPayload(FULL_RESUME);
  // Restore onto an EMPTY document: anything the snapshot failed to carry
  // shows up as missing, which is exactly what used to happen on restore.
  const restored = applySnapshot({}, snapshot);

  for (const field of SNAPSHOT_FIELDS) {
    assert.deepEqual(
      restored[field],
      FULL_RESUME[field],
      `${field} must survive snapshot → restore`,
    );
  }
});

test('the fields the old payload dropped are covered', () => {
  // Named explicitly: these are the ones that were silently lost.
  for (const field of ['achievements', 'licenses', 'publications', 'fontFamily', 'density', 'accentColor', 'sectionOrder', 'photoUrl']) {
    assert.ok(SNAPSHOT_FIELDS.includes(field), `${field} belongs in a snapshot`);
  }
});

test('every Resume column is either snapshotted or explicitly excluded', () => {
  // Reads the schema so ADDING a column fails this test until someone
  // decides whether it belongs in a version. Without this, the next
  // field added repeats the original bug in silence.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf-8');
  const model = schema.match(/^model Resume \{[\s\S]*?^\}/m);
  assert.ok(model, 'Resume model must be findable in schema.prisma');

  const columns = model[0]
    .split('\n')
    .slice(1, -1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('///') && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/)[0])
    .filter((name) => name && name !== 'user');

  const covered = new Set([...SNAPSHOT_FIELDS, ...SNAPSHOT_EXCLUDED_FIELDS]);
  const uncovered = columns.filter((c) => !covered.has(c));
  assert.deepEqual(
    uncovered,
    [],
    `New Resume column(s) ${uncovered.join(', ')} — add to SNAPSHOT_FIELDS or SNAPSHOT_EXCLUDED_FIELDS in resume-snapshot.ts`,
  );
});

test('an older snapshot keeps live values for fields it never captured', () => {
  // A snapshot taken before R-108 has no `achievements` key at all. It
  // does not know the value was empty — it knows nothing — so restoring
  // must not wipe the live content.
  const legacy = { title: 'Old Title', summary: 'Old summary', skills: ['Go'] };
  const restored = applySnapshot(FULL_RESUME, legacy);

  assert.equal(restored.title, 'Old Title', 'captured fields are restored');
  assert.deepEqual(restored.achievements, ['Patent US-123456'], 'uncaptured fields are left alone');
  assert.deepEqual(restored.licenses, FULL_RESUME.licenses);
  assert.equal(restored.accentColor, '#4f46e5');
});

test('applying a snapshot never mutates the resume it was given', () => {
  const snapshot = buildSnapshotPayload(FULL_RESUME);
  const target = { title: 'Live', achievements: ['keep me'] };
  const out = applySnapshot(target, snapshot);
  assert.equal(target.title, 'Live', 'the input object is untouched');
  assert.notEqual(out, target);
});

test('array columns stay arrays even when the record has nulls', () => {
  const sparse = buildSnapshotPayload({ title: 'T', summary: 'S' });
  for (const field of ['skills', 'languages', 'achievements', 'sectionOrder']) {
    assert.deepEqual(sparse[field], [], `${field} must not snapshot as undefined`);
  }
});

const { ResumeService } = require('../dist/resume/resume.service.js');

/**
 * R-108 — `getForExport` is what lets a download resolve to a saved
 * version. It must scope the lookup by BOTH resumeId and userId: a
 * version id alone must never reach another user's document.
 */
function serviceWith(versionRow, resume = FULL_RESUME) {
  const service = Object.create(ResumeService.prototype);
  service.get = async () => resume;
  service.prisma = { resumeVersion: { findFirst: async () => versionRow } };
  return service;
}

test('getForExport returns the live resume when no version is requested', async () => {
  const service = serviceWith(null);
  const out = await service.getForExport('u1', 'r1');
  assert.equal(out.summary, FULL_RESUME.summary);
});

test('getForExport materialises the requested version without touching the live resume', async () => {
  const service = serviceWith({ snapshot: { summary: 'Tailored for Acme', skills: ['Go', 'Kubernetes'] } });
  const out = await service.getForExport('u1', 'r1', 'v1');

  assert.equal(out.summary, 'Tailored for Acme', 'the version content is what exports');
  assert.deepEqual(out.skills, ['Go', 'Kubernetes']);
  // Fields the snapshot does not carry still come from the live resume.
  assert.deepEqual(out.licenses, FULL_RESUME.licenses);
  // And the live record itself is untouched.
  assert.equal(FULL_RESUME.summary, 'Ten years building payments infrastructure. Cut settlement time 40%.');
});

test('getForExport refuses a version that is not this user’s', async () => {
  // findFirst is scoped by { id, resumeId, userId }; a foreign version
  // simply does not match, and must 404 rather than silently exporting
  // the live resume as though nothing was asked for.
  const service = serviceWith(null);
  await assert.rejects(() => service.getForExport('u1', 'r1', 'someone-elses-version'), /not found/i);
});
