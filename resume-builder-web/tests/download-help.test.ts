import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDownloadHelpMailto, DOWNLOAD_HELP_BUTTON_LABEL } from '../src/lib/download-help';

// The "Get help" mailto link is the only path a paid user has when
// their download fails. These tests pin the contract so the link
// never silently degrades:
//   - the support email gets used as the recipient
//   - subject is consistent so support can filter
//   - every piece of context (resume id, user email, payment id,
//     error message) makes it into the body
//   - URL-encoding does not break special characters in the body
//   - missing optional fields produce graceful fallbacks

test('builds a valid mailto: URL with subject and body', () => {
  const url = buildDownloadHelpMailto({
    supportEmail: 'support@pocketresume.app',
    resumeId: 'r_abc123',
    userEmail: 'user@example.com',
    paymentId: 'pay_xyz789',
    errorMessage: 'PDF service is starting up. Please wait.',
    plan: 'STUDENT',
  });
  assert.ok(url.startsWith('mailto:support@pocketresume.app?'));
  assert.match(url, /subject=Resume(?:%20|\+)export(?:%20|\+)failed/i);
  assert.match(url, /body=/);
});

test('encodes user email + resume id + payment id into the body', () => {
  const url = buildDownloadHelpMailto({
    supportEmail: 's@x.io',
    resumeId: 'r_abc123',
    userEmail: 'user@example.com',
    paymentId: 'pay_xyz789',
    errorMessage: 'Network error',
  });
  const body = decodeURIComponent(url.split('body=')[1] || '');
  assert.match(body, /Resume id:\s*r_abc123/);
  assert.match(body, /Account email:\s*user@example\.com/);
  assert.match(body, /Payment id:\s*pay_xyz789/);
  assert.match(body, /Network error/);
});

test('falls back to "(not signed in)" when user email missing', () => {
  const url = buildDownloadHelpMailto({
    supportEmail: 's@x.io',
    resumeId: 'r_x',
  });
  const body = decodeURIComponent(url.split('body=')[1] || '');
  assert.match(body, /Account email:\s*\(not signed in\)/);
});

test('falls back to "(none / failed before capture)" when no payment id', () => {
  const url = buildDownloadHelpMailto({
    supportEmail: 's@x.io',
    resumeId: 'r_x',
    userEmail: 'u@x.io',
  });
  const body = decodeURIComponent(url.split('body=')[1] || '');
  assert.match(body, /Payment id:\s*\(none/);
});

test('falls back to "(no message)" when error string is empty', () => {
  const url = buildDownloadHelpMailto({
    supportEmail: 's@x.io',
    resumeId: 'r_x',
    errorMessage: '',
  });
  const body = decodeURIComponent(url.split('body=')[1] || '');
  assert.match(body, /Error shown to me:\s*\(no message\)/);
});

test('returns empty string when support email is not configured', () => {
  // Callers render a non-clickable fallback when this returns ''.
  const url = buildDownloadHelpMailto({
    supportEmail: '',
    resumeId: 'r_x',
  });
  assert.equal(url, '');
});

test('handles special characters in error message without breaking URL', () => {
  const url = buildDownloadHelpMailto({
    supportEmail: 's@x.io',
    resumeId: 'r_x',
    errorMessage: 'HTTP 500: <script>alert("x")</script> & "quotes" + ?query=1',
  });
  // URL is well-formed
  assert.doesNotThrow(() => new URL(url));
  // The body keeps the original message after decoding
  const body = decodeURIComponent(url.split('body=')[1] || '');
  assert.match(body, /<script>alert\("x"\)<\/script>/);
});

test('trims whitespace from user-supplied fields', () => {
  const url = buildDownloadHelpMailto({
    supportEmail: '  support@x.io  ',
    resumeId: '  r_abc123  ',
    userEmail: '  u@x.io  ',
    errorMessage: '  Something failed  ',
  });
  const body = decodeURIComponent(url.split('body=')[1] || '');
  assert.match(body, /Resume id:\s*r_abc123/);
  assert.match(body, /Account email:\s*u@x\.io/);
  assert.ok(url.startsWith('mailto:support@x.io?'));
});

test('button label is non-empty and human readable', () => {
  // Pinned so callers and tests agree.
  assert.ok(DOWNLOAD_HELP_BUTTON_LABEL.length >= 5);
  assert.match(DOWNLOAD_HELP_BUTTON_LABEL, /help/i);
});
