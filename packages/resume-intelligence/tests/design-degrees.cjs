const assert = require('node:assert/strict');
const test = require('node:test');
const { parseResumeText, mapParsedResume } = require('../dist/index.js');

// Regression: design/architecture/pharma/education degrees (B.Des, B.Arch,
// B.Pharm, B.Ed, BFA…) were not in the degree-token list, so a two-column
// designer resume lost its EDUCATION section entirely.

for (const degree of ['B.Des', 'M.Des', 'B.Arch', 'B.Pharm', 'B.Ed', 'BFA']) {
  test(`${degree} line is extracted as education`, () => {
    const mapped = mapParsedResume(parseResumeText([
      'Kiran Rao', 'kiran@x.com',
      'EDUCATION', `${degree}, NID Ahmedabad, 2014 - 2018`,
    ].join('\n')));
    assert.equal(mapped.education.length, 1, `${degree} education entry present`);
    assert.match(mapped.education[0].degree || '', new RegExp(degree.replace('.', '\\.'), 'i'));
  });
}
