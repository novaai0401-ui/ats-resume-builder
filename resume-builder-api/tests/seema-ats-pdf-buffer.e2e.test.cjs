/**
 * Real-PDF-buffer regression for the ATS resume that surfaced "( @ SOFT SKILLS"
 * as Experience #1 / empty full-name in the editor form (seema_almas_shaikh.pdf).
 *
 * Unlike seema-ats-pdf-upload.e2e.test.cjs, which feeds the already-extracted
 * text fixture, this test exercises the FULL upload path the controller uses:
 *
 *   buffer → extractPdfText (pdf-parse + repairTwoColumnPdfText) →
 *   normalizeUploadText → parseResumeText → mapParsedResume → sanitizer →
 *   finalizeExperience
 *
 * The earlier failure mode was inside repairTwoColumnPdfText: a single-column
 * resume's wrapped sentence endings ("domains.", "satisfaction, …", company
 * names like "Citi Corp") looked like a sidebar's short lines, so the
 * heuristic destructively moved every short line into a synthetic "SKILLS"
 * block at the end — eating the name line, the PROFESSIONAL SUMMARY heading,
 * and every company name.
 *
 * Without a buffer-level test, the text-fixture suites could never catch this
 * regression because they bypass extractPdfText entirely.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ResumeService } = require('../dist/resume/resume.service.js');

const FIXTURE = path.resolve(__dirname, 'fixtures', 'seema-ats-pdf.pdf');

test('parse-upload: ATS PDF buffer keeps 5 experiences and full name (no false-positive two-column repair)', async (t) => {
  if (!fs.existsSync(FIXTURE)) {
    t.skip(`fixture missing: ${FIXTURE}`);
    return;
  }
  const buffer = fs.readFileSync(FIXTURE);
  const service = new ResumeService({});
  const result = await service.parseResumeUpload({
    originalname: 'seema_almas_shaikh.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
  });

  // Full name recovered (was empty in the bug — repairTwoColumnPdfText
  // moved the name line into the synthetic SKILLS bucket).
  assert.equal(result.parsed.contact?.fullName, 'Seema Almas Yunus Shaikh',
    `expected fullName "Seema Almas Yunus Shaikh", got "${result.parsed.contact?.fullName}"`);
  assert.ok(/seemaalmasshaikh@gmail\.com/i.test(result.parsed.contact?.email || ''),
    `email missing; got "${result.parsed.contact?.email}"`);
  assert.ok(/9172780700/.test(result.parsed.contact?.phone || ''),
    `phone missing; got "${result.parsed.contact?.phone}"`);

  // Five experience entries with role + company (was 1 phantom "( @ SOFT SKILLS").
  const exp = result.parsed.experience || [];
  assert.equal(exp.length, 5,
    `expected 5 experiences, got ${exp.length}: ${JSON.stringify(exp.map((e) => `${e.role} @ ${e.company}`))}`);

  const required = [
    /\bciti corp\b/i,
    /\bernst\s*&\s*young\b/i,
    /\bone network enterprises\b/i,
    /\binfosys limited\b/i,
    /\bdigital group infotech\b/i,
  ];
  for (const re of required) {
    assert.ok(exp.some((e) => re.test(e.company || '')),
      `missing required company matching ${re}; got: ${exp.map((e) => e.company).join(' | ')}`);
  }

  for (const e of exp) {
    assert.ok((e.role || '').trim().length >= 2,
      `phantom / empty role: ${JSON.stringify(e)}`);
    assert.ok((e.company || '').trim().length >= 2,
      `phantom / empty company: ${JSON.stringify(e)}`);
    assert.ok(!/^\s*(soft|technical)\s+skills?\b/i.test(e.company || ''),
      `skill heading leaked into company: "${e.company}"`);
    assert.ok(!/^[\s\W]*$/.test(e.role || ''),
      `role is non-alphanumeric only: "${e.role}"`);
  }

  // Citi must be the first / current job with Present endDate.
  const citi = exp.find((e) => /citi/i.test(e.company || ''));
  assert.ok(/2022/.test(citi.startDate || ''), `Citi startDate wrong: "${citi.startDate}"`);
  assert.ok(/present/i.test(citi.endDate || ''), `Citi endDate wrong: "${citi.endDate}"`);

  // Education and cert are recovered.
  assert.ok((result.parsed.education || []).length >= 1,
    `expected ≥ 1 education entry; got ${(result.parsed.education || []).length}`);
  const azure = (result.parsed.certifications || []).find((c) => /azure/i.test(c.name || ''));
  assert.ok(azure, `Azure cert missing; got: ${JSON.stringify(result.parsed.certifications)}`);
});
