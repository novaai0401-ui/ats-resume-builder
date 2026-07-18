const assert = require('node:assert/strict');
const test = require('node:test');
const { validatePdfExportSafety } = require('../dist/resume/resume.service.js');

// Founder-reported bug: selecting the Sidebar Bold (visual, "Not ATS-safe")
// template and downloading failed, because the ATS-safety export gate —
// which rejects "|" separators and bullet glyphs common in IMPORTED resumes
// — also ran for templates that are explicitly sold as not-ATS-safe.
// These pin the fix: visual showcase templates skip the gate; the ATS
// family keeps it.

// A realistic imported resume: pipe separators + a bullet glyph, exactly
// what upload extraction produces from real-world PDFs.
const importedResume = {
  summary: 'Frontend leader • React | Redux | NodeJS with 12+ years of experience.',
  skills: ['React', 'Redux', 'NodeJS'],
  experience: [
    { company: 'Citi Corp', role: 'AVP', highlights: ['Led platform | modernization work.'] },
  ],
  education: [{ institution: 'Siddaganga Institute', degree: 'B.E.' }],
};

// A clean resume that passes the gate on any template.
const cleanResume = {
  summary: 'Frontend engineering leader with 12 years of experience delivering platforms.',
  skills: ['React', 'Redux', 'NodeJS'],
  experience: [
    { company: 'Citi Corp', role: 'AVP', highlights: ['Led modernization of the frontend platform for 40 teams.'] },
  ],
  education: [{ institution: 'Siddaganga Institute', degree: 'B.E.' }],
};

test('sidebar-bold (visual) skips the ATS gate — imported resume exports', () => {
  assert.doesNotThrow(() =>
    validatePdfExportSafety(importedResume, { enforceMinimumScore: false, templateId: 'sidebar-bold' }),
  );
});

test('creative and accent-header (visual) also skip the gate', () => {
  for (const templateId of ['creative', 'accent-header']) {
    assert.doesNotThrow(() =>
      validatePdfExportSafety(importedResume, { enforceMinimumScore: false, templateId }),
    );
  }
});

test('ATS-family templates KEEP the gate — pipes/bullets still rejected', () => {
  assert.throws(
    () => validatePdfExportSafety(importedResume, { enforceMinimumScore: false, templateId: 'classic' }),
    /BadRequest|unsupported formatting|errors/i,
  );
});

test('no templateId (legacy callers) keeps the strict gate', () => {
  assert.throws(() => validatePdfExportSafety(importedResume, { enforceMinimumScore: false }));
});

test('clean resume passes on an ATS template (gate not over-tightened)', () => {
  assert.doesNotThrow(() =>
    validatePdfExportSafety(cleanResume, { enforceMinimumScore: false, templateId: 'classic' }),
  );
});
