import assert from 'node:assert/strict';
import test from 'node:test';

// field-map.js has no import/export; it attaches to globalThis as a side
// effect (so the same file works as a classic MV3 content script).
import '../content/field-map.js';

const { fieldKeyForElement, fillValueForKey } = globalThis.CallbackCVFieldMap;

test('maps by autocomplete token (highest confidence)', () => {
  assert.equal(fieldKeyForElement({ autocomplete: 'email' }), 'email');
  assert.equal(fieldKeyForElement({ autocomplete: 'given-name' }), 'firstName');
  assert.equal(fieldKeyForElement({ autocomplete: 'family-name' }), 'lastName');
  assert.equal(fieldKeyForElement({ autocomplete: 'tel' }), 'phone');
  assert.equal(fieldKeyForElement({ autocomplete: 'section-x organization' }), 'currentCompany');
});

test('maps by name attribute', () => {
  assert.equal(fieldKeyForElement({ name: 'first_name' }), 'firstName');
  assert.equal(fieldKeyForElement({ name: 'lastName' }), 'lastName');
  assert.equal(fieldKeyForElement({ name: 'email' }), 'email');
});

test('maps by label text', () => {
  assert.equal(fieldKeyForElement({ labelText: 'Phone Number' }), 'phone');
  assert.equal(fieldKeyForElement({ labelText: 'City' }), 'city');
  assert.equal(fieldKeyForElement({ labelText: 'University' }), 'school');
  assert.equal(fieldKeyForElement({ labelText: 'Degree' }), 'degree');
});

test('maps by aria-label', () => {
  assert.equal(fieldKeyForElement({ ariaLabel: 'LinkedIn URL' }), 'linkedinUrl');
  assert.equal(fieldKeyForElement({ ariaLabel: 'Portfolio website' }), 'websiteUrl');
});

test('disambiguates first/last/full name', () => {
  assert.equal(fieldKeyForElement({ labelText: 'First Name' }), 'firstName');
  assert.equal(fieldKeyForElement({ labelText: 'Last Name' }), 'lastName');
  assert.equal(fieldKeyForElement({ labelText: 'Full Name' }), 'fullName');
  // bare "Name" falls back to fullName
  assert.equal(fieldKeyForElement({ labelText: 'Name' }), 'fullName');
  // a bare "Company Name" must NOT map to fullName; and since it isn't
  // explicitly the *current* employer, we conservatively skip it (null).
  assert.equal(fieldKeyForElement({ labelText: 'Company Name' }), null);
});

test('maps current company and title', () => {
  assert.equal(fieldKeyForElement({ labelText: 'Current Company' }), 'currentCompany');
  assert.equal(fieldKeyForElement({ labelText: 'Current Title' }), 'currentTitle');
});

test('returns null for unmatched and unsafe fields', () => {
  assert.equal(fieldKeyForElement({ labelText: 'Salary Expectation' }), null);
  assert.equal(fieldKeyForElement({ name: 'password', type: 'password' }), null);
  assert.equal(fieldKeyForElement({ name: 'resume', type: 'file' }), null);
  assert.equal(fieldKeyForElement({}), null);
  assert.equal(fieldKeyForElement(null), null);
});

test('fillValueForKey reads flat profile and joins arrays', () => {
  const profile = {
    firstName: 'Ada', email: 'ada@x.com',
    skills: ['JS', 'Python'], phone: ' 555 ', missing: null,
  };
  assert.equal(fillValueForKey(profile, 'firstName'), 'Ada');
  assert.equal(fillValueForKey(profile, 'email'), 'ada@x.com');
  assert.equal(fillValueForKey(profile, 'skills'), 'JS, Python');
  assert.equal(fillValueForKey(profile, 'phone'), '555'); // trimmed
  assert.equal(fillValueForKey(profile, 'missing'), '');
  assert.equal(fillValueForKey(profile, 'notThere'), '');
  assert.equal(fillValueForKey(null, 'firstName'), '');
});
