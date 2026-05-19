/**
 * End-to-end upload regression for the ATS resume PDF that surfaced as
 * "( @ SOFT SKILLS" / empty full-name in the editor form
 * (seema_almas_shaikh.pdf).
 *
 * The fixture is the exact text pdf-parse emits from the user's ATS resume
 * — preserving tabs in the contact line, page footers, and ligature drops.
 * We feed it through the same upload pipeline used by the controller
 * (normalizeUploadText → parseResumeText → mapParsedResume → import sanitiser
 *  → finalizeExperience) so the assertions cover every transform that touches
 * the structured data on the way to the client.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ResumeService } = require('../dist/resume/resume.service.js');

const FIXTURE = path.resolve(__dirname, 'fixtures', 'seema-ats-pdf-extract.txt');

test('parse-upload: seema_almas_shaikh.pdf does not produce "( @ SOFT SKILLS" phantom', async () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  const service = new ResumeService({});
  // Use a .txt extension so the upload pipeline skips PDF parsing — we are
  // feeding it the already-extracted text fixture directly.
  const result = await service.parseResumeUpload({
    originalname: 'seema-ats-pdf-extract.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from(text, 'utf8'),
  });

  // 1. Contact — full name is recovered.
  assert.equal(result.parsed.contact?.fullName, 'Seema Almas Yunus Shaikh',
    `full name lost; got "${result.parsed.contact?.fullName}"`);
  assert.ok(/seemaalmasshaikh@gmail\.com/i.test(result.parsed.contact?.email || ''),
    `email lost; got "${result.parsed.contact?.email}"`);

  // 2. Experience — five real entries; the phantom "(" / "SOFT SKILLS" entry
  // that the screenshot showed must NOT appear.
  const experiences = result.parsed.experience || [];
  assert.equal(experiences.length, 5,
    `expected 5 experiences, got ${experiences.length}: ${JSON.stringify(experiences.map((e) => `${e.role} @ ${e.company}`))}`);

  const expected = [
    /\bciti corp\b/i,
    /\bernst\s*&\s*young\b/i,
    /\bone network enterprises\b/i,
    /\binfosys limited\b/i,
    /\bdigital group infotech\b/i,
  ];
  for (const re of expected) {
    assert.ok(
      experiences.some((e) => re.test(e.company || '')),
      `missing experience company matching ${re}; got: ${experiences.map((e) => e.company).join(' | ')}`,
    );
  }

  for (const exp of experiences) {
    assert.ok((exp.role || '').trim().length >= 2,
      `experience role too short / phantom: ${JSON.stringify(exp)}`);
    assert.ok((exp.company || '').trim().length >= 2,
      `experience company too short / phantom: ${JSON.stringify(exp)}`);
    assert.ok(!/^\s*(soft|technical|hard|core|key)\s+(skills?|competencies)\b/i.test(exp.company || ''),
      `skill subsection label leaked into company: "${exp.company}"`);
    assert.ok(!/azure\s*az\s*9?00/i.test((exp.highlights || []).join(' ')),
      `Azure certification leaked into experience highlights: ${JSON.stringify(exp.highlights)}`);
  }

  // 3. Citi must keep its Dec 2022 – Present range; The Digital Group must
  // keep Apr 2014 – Jul 2017.
  const citi = experiences.find((e) => /citi/i.test(e.company || ''));
  assert.ok(/2022/.test(citi.startDate || ''), `Citi startDate wrong: "${citi.startDate}"`);
  assert.ok(/present/i.test(citi.endDate || ''), `Citi endDate wrong: "${citi.endDate}"`);

  const digital = experiences.find((e) => /digital group/i.test(e.company || ''));
  assert.ok(/2014/.test(digital.startDate || ''), `Digital Group startDate wrong: "${digital.startDate}"`);
  assert.ok(/2017/.test(digital.endDate || ''), `Digital Group endDate wrong: "${digital.endDate}"`);

  // 4. Education — at least one entry covering the engineering degree with
  // the (2008-07 - 2012-07) range.
  const edu = result.parsed.education || [];
  assert.ok(edu.some((e) => /babasaheb naik/i.test(e.institution || '')),
    `education institution missing; got: ${JSON.stringify(edu)}`);
  const eng = edu.find((e) => /babasaheb naik/i.test(e.institution || ''));
  assert.ok(/computer science/i.test(eng.degree || ''),
    `education degree wrong: "${eng.degree}"`);
  assert.ok(/2008/.test(eng.startDate || ''),
    `education startDate missing 2008: "${eng.startDate}"`);
  assert.ok(/2012/.test(eng.endDate || ''),
    `education endDate missing 2012: "${eng.endDate}"`);

  // 5. Certifications — Azure AZ900 cleanly parsed, no trailing " -".
  const certs = result.parsed.certifications || [];
  const azure = certs.find((c) => /azure/i.test(c.name || ''));
  assert.ok(azure, `Azure certification missing; got: ${JSON.stringify(certs)}`);
  assert.ok(!/[-–—|,]\s*$/.test(azure.name || ''),
    `Azure cert name has trailing connector: "${azure.name}"`);
  assert.ok(/2022/.test(azure.date || ''),
    `Azure cert year missing: "${azure.date}"`);

  // 6. The HOBBIES line containing "self-projects," must not be split into
  // a phantom PROJECTS heading that leaks hobby text into projects.
  for (const project of (result.parsed.projects || [])) {
    const allText = `${project.name || ''} ${(project.highlights || []).join(' ')}`;
    assert.ok(!/exploring emerging technologies/i.test(allText),
      `hobby text leaked into projects: ${JSON.stringify(project)}`);
    assert.ok(!/volunteering for tech mentorship/i.test(allText),
      `hobby text leaked into projects: ${JSON.stringify(project)}`);
  }
});
