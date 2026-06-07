const assert = require('node:assert/strict');
const test = require('node:test');
const {
  slugifyBase,
  generateSlug,
  isValidSlug,
  buildPortfolioSnapshot,
} = require('../dist/portfolio/portfolio-util.js');

test('slugifyBase produces url-safe slugs', () => {
  assert.equal(slugifyBase('Ada Lovelace — Senior Engineer!'), 'ada-lovelace-senior-engineer');
  assert.equal(slugifyBase('   '), 'portfolio');
  assert.equal(slugifyBase('C++ & Rust Dev'), 'c-rust-dev');
});

test('generateSlug appends a suffix and stays valid', () => {
  const slug = generateSlug('Ada Lovelace', () => 'abc123');
  assert.equal(slug, 'ada-lovelace-abc123');
  assert.equal(isValidSlug(slug), true);
});

test('isValidSlug accepts valid and rejects invalid', () => {
  assert.equal(isValidSlug('ada-lovelace-abc123'), true);
  assert.equal(isValidSlug('AB'), false); // too short + uppercase
  assert.equal(isValidSlug('has spaces'), false);
  assert.equal(isValidSlug('inva/lid'), false);
  assert.equal(isValidSlug(''), false);
});

test('buildPortfolioSnapshot selects recruiter-facing fields', () => {
  const resume = {
    title: 'Backend Engineer',
    contact: { fullName: 'Ada Lovelace' },
    summary: 'Builds reliable systems.',
    skills: ['Node.js', '', 'AWS'],
    experience: [
      { company: 'Acme', role: 'Lead', startDate: '2022', endDate: 'Present', highlights: ['Built X', ''] },
    ],
    education: [{ institution: 'MIT', degree: 'BSc', startDate: '2016', endDate: '2020' }],
    projects: [{ name: 'P1', role: 'Owner', url: 'https://x' }],
  };
  const snap = buildPortfolioSnapshot(resume, 'Senior Backend Engineer');
  assert.equal(snap.fullName, 'Ada Lovelace');
  assert.equal(snap.headline, 'Senior Backend Engineer');
  assert.deepEqual(snap.skills, ['Node.js', 'AWS']);
  assert.equal(snap.experience[0].highlights.length, 1);
  assert.equal(snap.education[0].institution, 'MIT');
  assert.equal(snap.projects[0].description, 'Owner'); // falls back to role
});

test('buildPortfolioSnapshot falls back to title when no headline', () => {
  const snap = buildPortfolioSnapshot({ title: 'Data Analyst', contact: { fullName: 'X' } });
  assert.equal(snap.headline, 'Data Analyst');
  assert.deepEqual(snap.skills, []);
  assert.deepEqual(snap.experience, []);
});

test('buildPortfolioSnapshot tolerates missing/garbage fields', () => {
  const snap = buildPortfolioSnapshot({});
  assert.equal(snap.fullName, '');
  assert.deepEqual(snap.skills, []);
  assert.deepEqual(snap.projects, []);
});
