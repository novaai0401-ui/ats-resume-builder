// Regression tests for resume-format diversity. Each fixture is a snapshot
// of the raw text produced by pdf-parse / mammoth for a real resume that
// previously broke the extractor. They are deliberately stored as text so
// the tests run without bundling the original PDFs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { mapParsedResume, parseResumeText, normalizeText } = require('../dist/index.js');

const FIXTURES = path.resolve(__dirname, 'fixtures');

function loadAndMap(name) {
  const text = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
  const parsed = parseResumeText(normalizeText(text));
  return { parsed, mapped: mapParsedResume(parsed) };
}

function companies(mapped) {
  return mapped.experience.map((exp) => (exp.company || '').toLowerCase());
}

// 1) Role on top line with tab-separated right-aligned date, company on next line.
//    Page break leaks the 5th entry into the LANGUAGES section. Recover it.
{
  const { mapped } = loadAndMap('seema-role-then-company-tabbed-date.txt');
  assert.equal(mapped.experience.length, 5, `Expected 5 entries, got ${mapped.experience.length}`);
  const cs = companies(mapped);
  assert.ok(cs.some((c) => c.includes('citi')), `Missing Citi: ${cs.join(' | ')}`);
  assert.ok(cs.some((c) => c.includes('ernst')), `Missing Ernst & Young: ${cs.join(' | ')}`);
  assert.ok(cs.some((c) => c.includes('one network')), `Missing One Network: ${cs.join(' | ')}`);
  assert.ok(cs.some((c) => c.includes('infosys')), `Missing Infosys: ${cs.join(' | ')}`);
  assert.ok(cs.some((c) => c.includes('digital group')), `Missing Digital Group (spillover): ${cs.join(' | ')}`);
}

// 2) Role / Company-with-location / (Date) on three separate lines.
{
  const { mapped } = loadAndMap('seema-role-company-date-three-lines.txt');
  assert.equal(mapped.experience.length, 5, `Expected 5 entries, got ${mapped.experience.length}`);
  const cs = companies(mapped);
  ['citi', 'ernst', 'one network', 'infosys', 'digital group'].forEach((needle) => {
    assert.ok(cs.some((c) => c.includes(needle)), `Missing ${needle}: ${cs.join(' | ')}`);
  });
}

// 3) Company on top line, Role with location and tab-separated date on next line.
//    Long descriptions ("As Assistant Vice President, ensured...") must NOT be
//    misclassified as role/company headers.
{
  const { mapped } = loadAndMap('seema-company-then-role-with-date.txt');
  assert.ok(mapped.experience.length >= 6, `Expected at least 6 entries, got ${mapped.experience.length}`);
  const cs = companies(mapped);
  ['citi', 'ey', 'one network', 'infosys', 'digital group'].forEach((needle) => {
    assert.ok(cs.some((c) => c.includes(needle)), `Missing ${needle}: ${cs.join(' | ')}`);
  });
  // No description-sentence-derived garbage companies
  for (const exp of mapped.experience) {
    assert.ok(
      !/^ensuring\b/i.test(exp.company || ''),
      `Description sentence leaked into company: ${exp.company}`,
    );
    assert.ok(
      !/(Innovated|Designed|Built|Led)\s/i.test(exp.role || ''),
      `Bullet-style sentence leaked into role: ${exp.role}`,
    );
  }
}

// 4) Two-column DOCX with Role on top line, "Company\tDate" on next line.
{
  const { mapped } = loadAndMap('krishnat-two-column-docx.txt');
  assert.ok(mapped.experience.length >= 2, `Expected at least 2 entries, got ${mapped.experience.length}`);
  const cs = companies(mapped);
  assert.ok(cs.some((c) => c.trim() === 'citi'), `Missing Citi: ${cs.join(' | ')}`);
  assert.ok(cs.some((c) => c.includes('cognizant')), `Missing Cognizant: ${cs.join(' | ')}`);
  // The "RESEARCH & PUBLICATIONS" all-caps heading must NOT leak in as a company.
  for (const exp of mapped.experience) {
    assert.ok(
      !/research/i.test(exp.company || ''),
      `Publication heading leaked into company: ${exp.company}`,
    );
  }
}

console.log('multi-format experience tests passed');
