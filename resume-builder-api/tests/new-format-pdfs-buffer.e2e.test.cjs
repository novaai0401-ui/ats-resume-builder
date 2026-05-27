/**
 * Buffer-level regression for three real-world resume layouts that previously
 * extracted incorrectly. Each is fed through the FULL upload path
 * (parseResumeUpload → extractPdfText/repairTwoColumnPdfText → normalizeUploadText
 * → parseResumeText → mapParsedResume → sanitizer → finalizeExperience) so the
 * whole pipeline is exercised, not just the text-fixture portion.
 *
 * The three failure modes these guard against:
 *
 *  1. nikhil-pipe-header.pdf — job headers shaped "Company |Role  dates" with
 *     NO space after the pipe ("Infosys Limited |Senior System Engineer").
 *     The pipe wasn't recognised as a separator, so the whole string became
 *     the role and a later "Project: … | Client" line was mis-detected as the
 *     company. Fix: pipe-spacing normalisation in splitRoleCompany + a guard
 *     that treats "Project:" lines as highlights, not headers.
 *
 *  2. muskan-fragmented-role-title.pdf — pdf-parse split the job title across
 *     lines ("Software" / "Engineer I - Klearnow.ai") and the resume has a
 *     standalone "TECHNICAL SKILLS" heading that previously tripped
 *     repairTwoColumnPdfText into destroying the whole document. Fixes:
 *     tightened the two-column repair to a sidebar-first signature, and a
 *     generalised fragmented-role-title merge in mergeFragmentedLines.
 *
 *  3. chaitanya-clustered-headings.pdf — a multi-column PDF emits every section
 *     heading in a cluster at the top ("SUMMARY\nWORK EXPERIENCE\nEDUCATION"),
 *     leaving the experience section empty and the body under later headings.
 *     Fix: surgical clustered-experience recovery + education recovery from the
 *     certifications section.
 *
 * Without buffer-level coverage the text-fixture suites can't catch regressions
 * in extractPdfText / repairTwoColumnPdfText, which only run on PDF buffers.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ResumeService } = require('../dist/resume/resume.service.js');

function fixture(name) {
  return path.resolve(__dirname, 'fixtures', name);
}

async function parse(file, originalname, mimetype = 'application/pdf') {
  const buffer = fs.readFileSync(file);
  const service = new ResumeService({});
  return service.parseResumeUpload({
    originalname,
    mimetype,
    size: buffer.length,
    buffer,
  });
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

test('new-format: krishnat-degree-institution.docx — "Degree - Institution" lines split into separate fields', async (t) => {
  const file = fixture('krishnat-degree-institution.docx');
  if (!fs.existsSync(file)) { t.skip(`fixture missing: ${file}`); return; }
  const result = await parse(file, 'krishnatmolawade_javatechlead.docx', DOCX_MIME);

  assert.equal(result.parsed.contact?.fullName, 'Krishnat Molawade');

  const edu = result.parsed.education || [];
  assert.equal(edu.length, 2, `expected 2 education entries, got ${edu.length}: ${JSON.stringify(edu)}`);

  // Every entry must have BOTH a non-empty degree AND institution — the bug was
  // the whole "Degree - Institution dates" string landing in degree with an
  // empty institution ("Institution is required" in the editor).
  for (const e of edu) {
    assert.ok((e.degree || '').trim().length >= 2, `degree empty: ${JSON.stringify(e)}`);
    assert.ok((e.institution || '').trim().length >= 2, `institution empty (the reported bug): ${JSON.stringify(e)}`);
    // The institution keyword must not be left stuck inside the degree field.
    assert.ok(!/\b(university|college)\b/i.test(e.degree || ''),
      `institution leaked into degree: "${e.degree}"`);
    // Dates must not remain in the degree text.
    assert.ok(!/\b(19|20)\d{2}\b/.test(e.degree || ''), `date left in degree: "${e.degree}"`);
  }

  const mtech = edu.find((e) => /m\.?tech/i.test(e.degree || ''));
  assert.ok(mtech, 'M.Tech entry missing');
  assert.match(mtech.institution || '', /mit-adt university/i, `M.Tech institution wrong: "${mtech.institution}"`);

  const btech = edu.find((e) => /b\.?tech/i.test(e.degree || ''));
  assert.ok(btech, 'B.Tech entry missing');
  assert.match(btech.institution || '', /walchand college/i, `B.Tech institution wrong: "${btech.institution}"`);

  // Experience still intact (regression guard).
  assert.equal((result.parsed.experience || []).length, 2);
});

test('new-format: nikhil-pipe-header.pdf — "Company |Role" headers split correctly, Project: lines are not companies', async (t) => {
  const file = fixture('nikhil-pipe-header.pdf');
  if (!fs.existsSync(file)) { t.skip(`fixture missing: ${file}`); return; }
  const result = await parse(file, 'NikhilResume_Angular.pdf');

  assert.equal(result.parsed.contact?.fullName, 'Nikhil Manik Zarad');
  const exp = result.parsed.experience || [];
  assert.equal(exp.length, 2, `expected 2 experiences, got ${exp.length}: ${JSON.stringify(exp.map((e) => `${e.role} @ ${e.company}`))}`);

  const infosys = exp.find((e) => /infosys/i.test(e.company || ''));
  assert.ok(infosys, `Infosys entry missing; got: ${exp.map((e) => e.company).join(' | ')}`);
  assert.match(infosys.role || '', /system engineer/i, `Infosys role wrong: "${infosys.role}"`);
  assert.match(infosys.company || '', /^infosys limited$/i, `Infosys company wrong: "${infosys.company}"`);
  assert.match(infosys.endDate || '', /present/i);

  const nvidia = exp.find((e) => /nvidia/i.test(e.company || ''));
  assert.ok(nvidia, 'Nvidia entry missing');
  assert.match(nvidia.role || '', /process executive/i, `Nvidia role wrong: "${nvidia.role}"`);

  // The "Project: Leancard … | AT&T Inc." description line must NOT become a company.
  for (const e of exp) {
    assert.ok(!/^project\b/i.test(e.company || ''), `Project line leaked into company: "${e.company}"`);
    assert.ok(!/\|/.test(e.role || ''), `Unsplit pipe left in role: "${e.role}"`);
  }
});

test('new-format: muskan-fragmented-role-title.pdf — fragmented titles merge; two-column repair does not fire', async (t) => {
  const file = fixture('muskan-fragmented-role-title.pdf');
  if (!fs.existsSync(file)) { t.skip(`fixture missing: ${file}`); return; }
  const result = await parse(file, 'Muskan_Gupta_Frontend_Developer.pdf');

  // Name + contact survive (regressed to empty when repairTwoColumnPdfText fired).
  assert.equal(result.parsed.contact?.fullName, 'Muskan Gupta', `fullName wrong: "${result.parsed.contact?.fullName}"`);
  assert.ok(/muskaang710@gmail\.com/i.test(result.parsed.contact?.email || ''), 'email missing');

  const exp = result.parsed.experience || [];
  assert.equal(exp.length, 2, `expected 2 experiences, got ${exp.length}: ${JSON.stringify(exp.map((e) => `${e.role} @ ${e.company}`))}`);

  const klearnow = exp.find((e) => /klearnow/i.test(e.company || ''));
  assert.ok(klearnow, 'Klearnow entry missing');
  assert.match(klearnow.role || '', /^software engineer/i, `Klearnow role should keep the "Software" fragment: "${klearnow.role}"`);

  const barclays = exp.find((e) => /barclays/i.test(e.company || ''));
  assert.ok(barclays, 'Barclays entry missing');
  assert.match(barclays.role || '', /^graduate analyst/i, `Barclays role should keep the "Graduate" fragment: "${barclays.role}"`);

  // No phantom "Role - …" entry, no "Haryana"/"Maharashtra" company.
  for (const e of exp) {
    assert.ok(!/^role\b/i.test(e.role || ''), `"Role -" sub-line became an entry: "${e.role}"`);
    assert.ok(!/^(haryana|maharashtra)$/i.test(e.company || ''), `location became a company: "${e.company}"`);
  }
});

test('new-format: chaitanya-clustered-headings.pdf — experience + education recovered despite clustered headings', async (t) => {
  const file = fixture('chaitanya-clustered-headings.pdf');
  if (!fs.existsSync(file)) { t.skip(`fixture missing: ${file}`); return; }
  const result = await parse(file, 'Chaitanya_Munje.pdf');

  assert.equal(result.parsed.contact?.fullName, 'Chaitanya Munje');
  assert.ok(/chaitanyamunje@gmail\.com/i.test(result.parsed.contact?.email || ''), 'email missing');

  const exp = result.parsed.experience || [];
  assert.ok(exp.length >= 1, `expected ≥ 1 experience, got ${exp.length}`);
  const bajaj = exp.find((e) => /bajaj/i.test(e.company || ''));
  assert.ok(bajaj, `Bajaj Finserv entry missing; got: ${exp.map((e) => e.company).join(' | ')}`);
  assert.match(bajaj.role || '', /software engineer/i, `Bajaj role wrong: "${bajaj.role}"`);
  assert.match(bajaj.startDate || '', /2022/);
  assert.match(bajaj.endDate || '', /present/i);

  // The work bullets sit BEFORE the header in this scrambled layout; they must
  // still be recovered as highlights (the role was previously left empty).
  assert.ok((bajaj.highlights || []).length >= 5,
    `expected the role's bullets to be recovered, got ${(bajaj.highlights || []).length}: ${JSON.stringify(bajaj.highlights)}`);
  assert.ok(bajaj.highlights.some((h) => /OTA delivery system/i.test(h)), 'first bullet (OTA) not recovered');
  assert.ok(bajaj.highlights.some((h) => /Azure cloud resources/i.test(h)), 'last bullet not recovered');
  // No bullet should be a split fragment ending in a dangling preposition.
  assert.ok(!bajaj.highlights.some((h) => /\b(by|from|into|at)$/i.test(h.trim())),
    `a bullet was left split on a trailing preposition: ${JSON.stringify(bajaj.highlights)}`);

  // Education is recovered from where the scramble dumped it.
  const edu = result.parsed.education || [];
  assert.ok(edu.length >= 1, 'education not recovered');
  assert.ok(
    edu.some((e) => /mechanical|engineering/i.test(`${e.degree} ${e.institution}`)),
    `degree not recovered; got: ${JSON.stringify(edu.map((e) => e.degree))}`,
  );

  // The Azure certificate stays a certificate (not swallowed into education).
  const certs = result.parsed.certifications || [];
  assert.ok(certs.some((c) => /azure/i.test(c.name || '')), `Azure cert missing; got: ${JSON.stringify(certs.map((c) => c.name))}`);

  // No phantom certificates from contact / summary prose leaking in.
  for (const c of certs) {
    assert.ok(!/@/.test(c.name || ''), `contact leaked into cert: "${c.name}"`);
    assert.ok(!/^[a-z]/.test(c.name || ''), `prose fragment became a cert: "${c.name}"`);
  }
});

test('new-format: chandan-multi-degree.pdf — all three education entries recovered, no false "missing roles" warning', async (t) => {
  const file = fixture('chandan-multi-degree.pdf');
  if (!fs.existsSync(file)) { t.skip(`fixture missing: ${file}`); return; }
  const result = await parse(file, 'chandankumar.pdf');

  assert.equal(result.parsed.contact?.fullName, 'Chandan Kumar');

  // Four real jobs (the resume lists 4; the older date ranges belong to
  // education, which previously made the experience count look short).
  const exp = result.parsed.experience || [];
  assert.equal(exp.length, 4, `expected 4 experiences, got ${exp.length}: ${JSON.stringify(exp.map((e) => `${e.role} @ ${e.company}`))}`);
  for (const company of [/citi/i, /ernst\s*&\s*young/i, /one network/i, /infosys/i]) {
    assert.ok(exp.some((e) => company.test(e.company || '')), `missing company ${company}; got ${exp.map((e) => e.company).join(' | ')}`);
  }

  // All THREE degrees are recovered (they leaked into the hobbies/interests
  // section; the fallback previously stopped after the first one).
  const edu = result.parsed.education || [];
  assert.ok(edu.length >= 3, `expected ≥ 3 education entries, got ${edu.length}: ${JSON.stringify(edu.map((e) => e.degree))}`);
  const eduText = edu.map((e) => `${e.degree} ${e.institution}`).join(' | ');
  assert.match(eduText, /telecommunication|siddaganga/i, 'B.E. degree missing');
  assert.match(eduText, /associate of science|a\.n\.s\.m/i, 'Associate degree missing');
  assert.match(eduText, /high school|d\.a\.v/i, 'High School entry missing');

  // The cross-check must NOT false-flag missing roles: the extra date ranges
  // are accounted for by the education entries.
  assert.equal(result.verification.ok, true, `verification flagged: ${JSON.stringify(result.verification.warnings)}`);
});

test('new-format: cross-verification reports clean (ok=true) for all three resumes', async (t) => {
  for (const name of ['nikhil-pipe-header.pdf', 'muskan-fragmented-role-title.pdf', 'chaitanya-clustered-headings.pdf']) {
    const file = fixture(name);
    if (!fs.existsSync(file)) { t.skip(`fixture missing: ${file}`); continue; }
    const result = await parse(file, name);
    assert.ok(result.verification, `verification report missing for ${name}`);
    assert.equal(
      result.verification.ok,
      true,
      `verification flagged ${name}: ${JSON.stringify(result.verification.warnings)}`,
    );
    // Self-healing loop fields are exposed on the response. The primary pass
    // already succeeds for these (the real fixes live in the primary path), so
    // the retry stays dormant.
    assert.equal(typeof result.debug.reExtracted, 'boolean', 'debug.reExtracted should be present');
    assert.equal(result.debug.reExtracted, false, `${name} should not need a self-healing retry`);
  }
});
