const assert = require('node:assert/strict');
const test = require('node:test');
const { simulateAts } = require('../dist/resume/ats-simulator.js');

test('flags missing contact essentials as high severity', () => {
  const r = simulateAts({ contact: {}, experience: [], education: [] });
  const kinds = r.risks.map((x) => x.kind);
  assert.ok(kinds.includes('contact-missing-name'));
  assert.ok(kinds.includes('contact-missing-email'));
  const sev = r.risks.find((x) => x.kind === 'contact-missing-email').severity;
  assert.equal(sev, 'high');
});

test('confidence drops with risk severity', () => {
  const clean = simulateAts({
    contact: { fullName: 'Jane', email: 'j@x.com', phone: '+1 555 0100', location: 'NYC' },
    summary: 'Two short sentences. Both crisp.',
    skills: ['React', 'TypeScript', 'Node', 'Postgres', 'AWS', 'Docker', 'Jest', 'Git'],
    experience: [{ role: 'Engineer', company: 'Acme', startDate: 'Jan 2022', endDate: 'Present', highlights: ['Built X'] }],
    education: [{ degree: 'B.S. CS', institution: 'University', startDate: '2018', endDate: '2022' }],
  });
  const broken = simulateAts({ contact: {}, summary: '', skills: [], experience: [{ role: '', company: '' }], education: [] });
  assert.ok(clean.confidence > broken.confidence);
  assert.ok(clean.confidence >= 90);
});

test('flags non-chronological experience', () => {
  const r = simulateAts({
    contact: { fullName: 'Jane', email: 'j@x.com', phone: '+1', location: 'X' },
    experience: [
      { role: 'A', company: 'Co1', startDate: 'Jan 2018', endDate: 'Dec 2019' },
      { role: 'B', company: 'Co2', startDate: 'Jan 2022', endDate: 'Dec 2024' },
    ],
  });
  assert.ok(r.risks.some((x) => x.kind === 'experience-non-chronological'));
});

test('flags overly long bullets and weak starters', () => {
  const longBullet = 'Worked on many things ' + Array.from({ length: 30 }, () => 'word').join(' ');
  const r = simulateAts({
    contact: { fullName: 'Jane', email: 'j@x.com' },
    experience: [{ role: 'X', company: 'Y', startDate: '2023', endDate: '2024', highlights: [longBullet] }],
  });
  const kinds = r.risks.map((x) => x.kind);
  assert.ok(kinds.includes('bullet-too-long'));
  assert.ok(kinds.includes('bullet-weak-starter'));
});

test('flags too few and too many skills appropriately', () => {
  const few = simulateAts({ contact: { fullName: 'X', email: 'x@x' }, skills: ['React'] });
  assert.ok(few.risks.some((x) => x.kind === 'skills-too-few'));
  const many = simulateAts({ contact: { fullName: 'X', email: 'x@x' }, skills: Array.from({ length: 50 }, (_, i) => `Skill${i}`) });
  assert.ok(many.risks.some((x) => x.kind === 'skills-too-many'));
});

test('flags creative date formats but accepts canonical ones', () => {
  const ok = simulateAts({
    contact: { fullName: 'X', email: 'x@x' },
    experience: [{ role: 'A', company: 'B', startDate: 'Jan 2024', endDate: 'Present' }],
  });
  assert.equal(ok.risks.filter((x) => x.kind === 'creative-date-format').length, 0);

  const bad = simulateAts({
    contact: { fullName: 'X', email: 'x@x' },
    experience: [{ role: 'A', company: 'B', startDate: 'around early 24', endDate: 'still there' }],
  });
  assert.ok(bad.risks.some((x) => x.kind === 'creative-date-format'));
});

test('recruiterView contains the canonical section structure', () => {
  const r = simulateAts({
    contact: { fullName: 'Jane', email: 'j@x.com' },
    summary: 'A summary.',
    skills: ['React'],
    experience: [{ role: 'Engineer', company: 'Acme', startDate: '2022', endDate: '2024', highlights: ['Built X'] }],
    education: [{ degree: 'B.S.', institution: 'U', startDate: '2018', endDate: '2022' }],
  });
  assert.ok(r.recruiterView.includes('Jane'));
  assert.ok(r.recruiterView.includes('SUMMARY'));
  assert.ok(r.recruiterView.includes('EXPERIENCE'));
  assert.ok(r.recruiterView.includes('EDUCATION'));
  assert.ok(r.recruiterView.includes('• Built X'));
});

test('fields list explicitly marks missing values', () => {
  const r = simulateAts({ contact: {} });
  const email = r.fields.find((f) => f.label === 'Email');
  assert.equal(email.missing, true);
});
