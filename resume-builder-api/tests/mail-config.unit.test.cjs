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
  // Host/user/from fall back to SMTP_DEFAULTS (the shared Gmail mailbox), so
  // the ONLY variable that can still be missing is the App Password.
  assert.match(s.reason, /SMTP_PASS/);
  assert.doesNotMatch(s.reason, /SMTP_HOST|SMTP_USER/);
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

test('TLS mode is auto-derived from the port (Gmail 587 → secure=false even if env says true)', () => {
  const m587 = new MailService(cfg({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'apppass1234', SMTP_SECURE: 'true' }));
  assert.equal(m587.getStatus().secure, false);
  const m465 = new MailService(cfg({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'apppass1234', SMTP_SECURE: 'false' }));
  assert.equal(m465.getStatus().secure, true);
});

test('getStatus exposes lastSendError (null until a send fails)', () => {
  const m = new MailService(cfg({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'apppass1234' }));
  assert.equal(m.getStatus().lastSendError, null);
});

const { normalizeSmtpPass, resolveFromAddress } = require('../dist/mail/mail.service.js');

test('Gmail App Password: display spaces are stripped (Gmail hosts only)', () => {
  assert.equal(normalizeSmtpPass('smtp.gmail.com', 'abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.equal(normalizeSmtpPass('smtp.googlemail.com', 'ab cd ef gh'), 'abcdefgh');
  // Non-Gmail host: leave a spaced password untouched.
  assert.equal(normalizeSmtpPass('smtp.zoho.com', 'my pass word'), 'my pass word');
});

test('From address is forced to the authenticated mailbox, keeping the display name', () => {
  // Mismatched SMTP_FROM address → rewritten to the authenticated user.
  assert.equal(resolveFromAddress('CallbackCV <noreply@other.com>', 'novaai0401@gmail.com'), 'CallbackCV <novaai0401@gmail.com>');
  // Bare display name → attach the user address.
  assert.equal(resolveFromAddress('CallbackCV', 'novaai0401@gmail.com'), 'CallbackCV <novaai0401@gmail.com>');
  // Bare address / empty → just the authenticated address.
  assert.equal(resolveFromAddress('', 'novaai0401@gmail.com'), 'novaai0401@gmail.com');
  assert.equal(resolveFromAddress('whoever@x.com', 'novaai0401@gmail.com'), 'novaai0401@gmail.com');
  // Non-email SMTP_USER (unusual providers) → keep SMTP_FROM as-is.
  assert.equal(resolveFromAddress('Brand <a@b.com>', 'AKIAEXAMPLEUSER'), 'Brand <a@b.com>');
});

test('a Gmail config with a spaced app password + branded From resolves correctly end-to-end', () => {
  const m = new MailService(cfg({
    SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587',
    SMTP_USER: 'novaai0401@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop',
    SMTP_FROM: 'CallbackCV <novaai0401@gmail.com>',
  }));
  const s = m.getStatus();
  assert.equal(s.configured, true, `reason: ${s.reason}`);
  assert.equal(s.secure, false);
  assert.equal(s.fromAddress, 'CallbackCV <novaai0401@gmail.com>');
});
