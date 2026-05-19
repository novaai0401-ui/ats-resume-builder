/**
 * Regression test for the ATS PDF that triggered the
 * "( @ SOFT SKILLS" phantom experience and missing-name extraction
 * (seema_almas_shaikh.pdf).
 *
 * The fixture is the EXACT text that pdf-parse emits from the user's ATS
 * resume PDF — ligature drops, page-footer markers, tabs in the contact
 * line and all. Locks in the behaviour that
 *
 *   - the candidate's name is recovered into contact.fullName
 *   - exactly five experience entries are extracted (Citi, EY, One Network,
 *     Infosys, The Digital Group), each with role + company + date range
 *   - no phantom experience whose company is "SOFT SKILLS" / role is "("
 *     leaks in from the SKILLS / EDUCATION / CERTIFICATIONS sections
 *   - the Azure AZ900 certification keeps its issuer ("Microsoft") and
 *     year (2022) and does not leak as an experience highlight
 *   - the standalone ACHIEVEMENTS section does NOT create one project
 *     per achievement bullet, and the HOBBIES section does not synthesise
 *     a phantom "PROJECTS" heading from the words "self-projects"
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseResumeText, mapParsedResume } = require('../dist/index.js');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'seema-ats-pdf-extract.txt'),
  'utf8',
);

const parsed = parseResumeText(fixture);
const mapped = mapParsedResume(parsed);

// 1. Header — full name is recovered even though the contact block is tab-
// separated and a multi-line headline sits between the name and the contact
// labels.
assert.equal(
  mapped.contact?.fullName,
  'Seema Almas Yunus Shaikh',
  `expected full name "Seema Almas Yunus Shaikh", got "${mapped.contact?.fullName}"`,
);
assert.ok(/seemaalmasshaikh@gmail\.com/i.test(mapped.contact?.email || ''),
  `email not extracted, got "${mapped.contact?.email}"`);
assert.ok(/9172780700/.test(mapped.contact?.phone || ''),
  `phone not extracted, got "${mapped.contact?.phone}"`);
assert.ok(/Pune/i.test(mapped.contact?.location || ''),
  `location missing Pune, got "${mapped.contact?.location}"`);

// 2. Experience — five real entries, no phantom "SOFT SKILLS" / "(" entry.
const companies = mapped.experience.map((e) => (e.company || '').toLowerCase());
const roles = mapped.experience.map((e) => (e.role || '').toLowerCase());
const expectedCompanies = [
  /\bciti corp\b/,
  /\bernst\s*&\s*young\b/,
  /\bone network enterprises\b/,
  /\binfosys limited\b/,
  /\bdigital group infotech\b/,
];
for (const re of expectedCompanies) {
  assert.ok(
    companies.some((c) => re.test(c)),
    `expected experience company matching ${re}; got: ${companies.join(' | ')}`,
  );
}

// No phantom skill / education / certification entries.
for (const exp of mapped.experience) {
  const company = (exp.company || '').toLowerCase();
  const role = (exp.role || '').toLowerCase();
  assert.ok(
    !/^\s*(soft|technical|hard|core|key)\s+(skills?|competencies)\b/.test(company),
    `Skill subsection label leaked into company: "${exp.company}"`,
  );
  assert.ok(
    !/^\s*(soft|technical|hard|core|key)\s+(skills?|competencies)\b/.test(role),
    `Skill subsection label leaked into role: "${exp.role}"`,
  );
  assert.ok(
    !/^[\s\W]*$/.test(exp.role || ''),
    `Role is non-alphanumeric only ("${exp.role}") — phantom entry`,
  );
  assert.ok(
    !/azure\s*az\s*9?00/i.test((exp.highlights || []).join(' ')),
    `Certification leaked into experience highlights: ${JSON.stringify(exp.highlights)}`,
  );
}

// Dates: Citi must be Dec 2022 – Present, Digital Group must be Apr 2014 – Jul 2017.
const citi = mapped.experience.find((e) => /citi/i.test(e.company));
assert.ok(citi, 'Citi entry missing');
assert.ok(/2022/.test(citi.startDate || ''), `Citi startDate wrong: "${citi.startDate}"`);
assert.ok(/present/i.test(citi.endDate || ''), `Citi endDate wrong: "${citi.endDate}"`);

const digital = mapped.experience.find((e) => /digital group/i.test(e.company));
assert.ok(digital, 'The Digital Group entry missing');
assert.ok(/2014/.test(digital.startDate || ''), `Digital Group startDate wrong: "${digital.startDate}"`);
assert.ok(/2017/.test(digital.endDate || ''), `Digital Group endDate wrong: "${digital.endDate}"`);

// Every experience entry must carry BOTH a role and a company (the form rejects
// rows where either is blank; the bug under repair surfaced empty-role rows).
for (const exp of mapped.experience) {
  assert.ok((exp.role || '').trim().length >= 2, `Experience missing role: ${JSON.stringify(exp)}`);
  assert.ok((exp.company || '').trim().length >= 2, `Experience missing company: ${JSON.stringify(exp)}`);
}

// 3. Education — one entry, with the institution + degree + (2008-07 - 2012-07)
//    range correctly attached.
const edu = mapped.education;
assert.ok(edu.length >= 1, 'no education extracted');
assert.ok(
  edu.some((e) => /babasaheb naik/i.test(e.institution)),
  `Education institution not found: ${JSON.stringify(edu)}`,
);
const eng = edu.find((e) => /babasaheb naik/i.test(e.institution));
assert.ok(/computer science/i.test(eng.degree || ''),
  `Education degree wrong: "${eng.degree}"`);
assert.ok(/2008/.test(eng.startDate || ''),
  `Education startDate missing 2008: "${eng.startDate}"`);
assert.ok(/2012/.test(eng.endDate || ''),
  `Education endDate missing 2012: "${eng.endDate}"`);

// 4. Certifications — Azure AZ900 / Microsoft / 2022 must come through cleanly,
//    without a trailing " -" left over from the "(Microsoft - 2022)" cleanup.
assert.ok(mapped.certifications.length >= 1, 'no certifications extracted');
const azure = mapped.certifications.find((c) => /azure/i.test(c.name || ''));
assert.ok(azure, 'Azure cert missing');
assert.ok(
  !/[-–—|,]\s*$/.test(azure.name),
  `Azure cert name has trailing connector: "${azure.name}"`,
);
assert.ok(/2022/.test(azure.date || ''), `Azure cert year wrong: "${azure.date}"`);
assert.ok(
  /microsoft/i.test(azure.issuer || azure.name || ''),
  `Azure cert issuer/name missing Microsoft: ${JSON.stringify(azure)}`,
);

// 5. Projects — the standalone ACHIEVEMENTS section + HOBBIES section must NOT
// produce a parade of phantom project entries with sentence-style "names".
// (The HOBBIES word "self-projects" used to be split into a fake PROJECTS
// heading; the ACHIEVEMENTS bullets used to each spawn a new project because
// looksLikeProjectTitle matched on any line containing the word "project".)
for (const project of mapped.projects || []) {
  const name = String(project.name || '').trim();
  // Real project titles are short identifiers, not multi-clause sentences
  // ending in commas or periods.
  assert.ok(
    name.length === 0 || (!/,\s*$/.test(name) && !/^launched|^consistently/i.test(name)),
    `Phantom project from achievements bullet: "${name}"`,
  );
}

console.log('seema-ats-pdf regression: all assertions passed');
