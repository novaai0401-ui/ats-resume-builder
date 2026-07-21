const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAutofillProfile, splitName, splitLocation } = require('../dist/autofill/autofill.util.js');

// R-093 — the flat profile the browser extension autofills into ATS forms.
// Pinned: name/location splitting, link classification, current-role pick,
// defensive handling of missing/garbage resume shapes (always strings).

test('splitName handles 0/1/2/3-word names', () => {
  assert.deepEqual(splitName(''), { firstName: '', lastName: '' });
  assert.deepEqual(splitName('Cher'), { firstName: 'Cher', lastName: '' });
  assert.deepEqual(splitName('Ada Lovelace'), { firstName: 'Ada', lastName: 'Lovelace' });
  assert.deepEqual(splitName('Chandan Kumar Shaikh'), { firstName: 'Chandan Kumar', lastName: 'Shaikh' });
});

test('splitLocation parses City, State, Country', () => {
  assert.deepEqual(splitLocation('Pune, MH, India'), { city: 'Pune', state: 'MH', country: 'India' });
  assert.deepEqual(splitLocation('Pune'), { city: 'Pune', state: '', country: '' });
  assert.deepEqual(splitLocation(''), { city: '', state: '', country: '' });
});

test('buildAutofillProfile flattens a full resume', () => {
  const p = buildAutofillProfile({
    contact: {
      fullName: 'Ada Lovelace', email: 'ada@x.com', phone: '+91 90000 00000',
      location: 'Pune, MH, India',
      links: ['https://linkedin.com/in/ada', 'https://ada.dev'],
    },
    summary: 'Engineer.',
    experience: [{ role: 'AVP', company: 'Citi' }, { role: 'Junior', company: 'Old' }],
    education: [{ institution: 'IIT', degree: 'B.Tech' }],
    skills: ['React', 'Node', 'React'],
  });
  assert.equal(p.firstName, 'Ada');
  assert.equal(p.lastName, 'Lovelace');
  assert.equal(p.email, 'ada@x.com');
  assert.equal(p.city, 'Pune');
  assert.equal(p.country, 'India');
  assert.equal(p.linkedinUrl, 'https://linkedin.com/in/ada');
  assert.equal(p.websiteUrl, 'https://ada.dev');
  assert.equal(p.currentTitle, 'AVP');       // first experience wins
  assert.equal(p.currentCompany, 'Citi');
  assert.equal(p.school, 'IIT');
  assert.deepEqual(p.skills, ['React', 'Node']); // deduped
});

test('buildAutofillProfile never throws on garbage / missing shape (always strings)', () => {
  for (const junk of [null, undefined, {}, { contact: 'nope', experience: 5, skills: 'x' }]) {
    const p = buildAutofillProfile(junk);
    for (const k of ['firstName','lastName','fullName','email','phone','location','city','state','country','linkedinUrl','websiteUrl','currentTitle','currentCompany','school','degree','summary']) {
      assert.equal(typeof p[k], 'string', `${k} must be a string`);
    }
    assert.ok(Array.isArray(p.skills));
  }
});
