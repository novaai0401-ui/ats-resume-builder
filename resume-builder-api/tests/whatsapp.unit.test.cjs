const assert = require('node:assert/strict');
const test = require('node:test');
const { WhatsappService, normalizeWhatsappPhone } = require('../dist/notifications/whatsapp.service.js');

// R-087 — the optional WhatsApp channel. These pin the env-gating contract:
// silent no-op when unconfigured (the app must behave exactly as before the
// feature existed), sendTemplate never throws, and the access token never
// leaks through the status snapshot.

function cfg(map) {
  return { get: (k, d) => (map[k] !== undefined ? map[k] : d) };
}

const SECRET = 'EAAG' + 'secrettoken'.repeat(4);

test('getStatus: no env → not configured, reason names both missing vars', () => {
  const s = new WhatsappService(cfg({})).getStatus();
  assert.equal(s.configured, false);
  assert.match(s.reason, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(s.reason, /WHATSAPP_PHONE_NUMBER_ID/);
});

test('getStatus: token but no phone-number ID → still not configured', () => {
  const s = new WhatsappService(cfg({ WHATSAPP_ACCESS_TOKEN: SECRET })).getStatus();
  assert.equal(s.configured, false);
  assert.match(s.reason, /WHATSAPP_PHONE_NUMBER_ID/);
  assert.doesNotMatch(s.reason, /WHATSAPP_ACCESS_TOKEN/);
});

test('getStatus: both env vars → configured, defaults surfaced, ID masked', () => {
  const svc = new WhatsappService(cfg({
    WHATSAPP_ACCESS_TOKEN: SECRET,
    WHATSAPP_PHONE_NUMBER_ID: '109876543210001',
  }));
  const s = svc.getStatus();
  assert.equal(svc.isConfigured(), true);
  assert.equal(s.configured, true);
  assert.equal(s.reason, '');
  assert.equal(s.apiVersion, 'v21.0'); // default surfaced
  assert.equal(s.templateLanguage, 'en'); // default surfaced
  // Masked: only the last 4 digits visible.
  assert.match(s.maskedPhoneNumberId, /^\*+0001$/);
  assert.ok(!s.maskedPhoneNumberId.includes('10987654321'));
});

test('getStatus: custom version + language are honoured', () => {
  const s = new WhatsappService(cfg({
    WHATSAPP_ACCESS_TOKEN: SECRET,
    WHATSAPP_PHONE_NUMBER_ID: '1',
    WHATSAPP_API_VERSION: 'v22.0',
    WHATSAPP_TEMPLATE_LANG: 'en_US',
  })).getStatus();
  assert.equal(s.apiVersion, 'v22.0');
  assert.equal(s.templateLanguage, 'en_US');
});

test('getStatus JSON never contains the access token', () => {
  const s = new WhatsappService(cfg({
    WHATSAPP_ACCESS_TOKEN: SECRET,
    WHATSAPP_PHONE_NUMBER_ID: '109876543210001',
  })).getStatus();
  assert.ok(!JSON.stringify(s).includes(SECRET));
});

test('normalizeWhatsappPhone: E.164 with + → digits without +', () => {
  assert.equal(normalizeWhatsappPhone('+919876543210'), '919876543210');
});

test('normalizeWhatsappPhone: already-bare country-code number is kept', () => {
  assert.equal(normalizeWhatsappPhone('919876543210'), '919876543210');
});

test('normalizeWhatsappPhone: 0-prefixed national number gets the default country code', () => {
  assert.equal(normalizeWhatsappPhone('09876543210'), '919876543210');
});

test('normalizeWhatsappPhone: bare 10-digit local number gets the default country code', () => {
  assert.equal(normalizeWhatsappPhone('9876543210'), '919876543210');
});

test('normalizeWhatsappPhone: spaces, dashes and parens are stripped', () => {
  assert.equal(normalizeWhatsappPhone('+91 98765 43210'), '919876543210');
  assert.equal(normalizeWhatsappPhone('+1 (415) 555-0100'), '14155550100');
});

test('normalizeWhatsappPhone: junk / too-short input → empty string', () => {
  assert.equal(normalizeWhatsappPhone(''), '');
  assert.equal(normalizeWhatsappPhone('not a phone'), '');
  assert.equal(normalizeWhatsappPhone('1234'), '');
});

test('sendTemplate: unconfigured → resolves ok:false, never throws (no network)', async () => {
  const svc = new WhatsappService(cfg({}));
  const res = await svc.sendTemplate('+919876543210', 'outcome_nudge', ['Acme', 'SDE']);
  assert.equal(res.ok, false);
  assert.match(res.error, /WHATSAPP_/);
});

test('sendTemplate: configured but invalid recipient phone → ok:false, no throw', async () => {
  const svc = new WhatsappService(cfg({
    WHATSAPP_ACCESS_TOKEN: SECRET,
    WHATSAPP_PHONE_NUMBER_ID: '1',
  }));
  const res = await svc.sendTemplate('nope', 'outcome_nudge', ['Acme']);
  assert.equal(res.ok, false);
  assert.match(res.error, /phone/i);
});
