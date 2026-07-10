const assert = require('node:assert/strict');
const test = require('node:test');
const { MailService } = require('../dist/mail/mail.service.js');

function cfg(map) {
  return { get: (k, d) => (map[k] !== undefined ? map[k] : d) };
}

test('missing SMTP vars → not configured, precise reason lists them', () => {
  const m = new MailService(cfg({}));
  const s = m.getStatus();
  assert.equal(s.configured, false);
  assert.match(s.reason, /SMTP_HOST/);
  assert.match(s.reason, /SMTP_USER/);
  assert.match(s.reason, /SMTP_PASS/);
});

test('real Gmail creds are accepted (not flagged as placeholder)', () => {
  const m = new MailService(cfg({
    SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587',
    SMTP_USER: 'novaai0401@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop',
    SMTP_FROM: 'novaai0401@gmail.com',
  }));
  const s = m.getStatus();
  assert.equal(s.configured, true, `reason: ${s.reason}`);
  assert.equal(s.reason, '');
  assert.equal(s.host, 'smtp.gmail.com');
  assert.match(s.userMasked, /gmail\.com$/);
  assert.doesNotMatch(s.userMasked, /novaai0401/); // masked
});

test('placeholder creds are rejected with a targeted reason', () => {
  const m = new MailService(cfg({
    SMTP_HOST: 'smtp.example.com', SMTP_USER: 'you@example.com', SMTP_PASS: 'changeme',
  }));
  const s = m.getStatus();
  assert.equal(s.configured, false);
  assert.match(s.reason, /placeholder/i);
});

test('a real address containing "test" is NOT a false positive', () => {
  const m = new MailService(cfg({
    SMTP_HOST: 'smtp.zoho.com', SMTP_USER: 'attestation@mycompany.com', SMTP_PASS: 'S0meRealPass!23',
  }));
  assert.equal(m.getStatus().configured, true);
});
