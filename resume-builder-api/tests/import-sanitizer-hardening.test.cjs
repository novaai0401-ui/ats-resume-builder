/**
 * Unit test for the import-sanitizer hardening additions.
 *
 * The API project uses the Node test runner. This test compiles the
 * sanitizer source standalone (it has no external dependencies) and
 * verifies that:
 *  - HTML / script content is stripped from extracted strings
 *  - Control characters are removed
 *  - javascript: and data:text/html links are filtered out
 *  - Otherwise sanitization is unchanged
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SRC = path.join(__dirname, '..', 'src', 'resume', 'import-sanitizer.ts');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitizer-build-'));
const TMP_SRC = path.join(TMP_DIR, 'import-sanitizer.ts');
fs.copyFileSync(SRC, TMP_SRC);

execSync(
  `npx --yes tsc --target es2022 --module commonjs --esModuleInterop --skipLibCheck --outDir ${TMP_DIR} ${TMP_SRC}`,
  { stdio: 'pipe', cwd: TMP_DIR },
);

const { sanitizeImportedResume } = require(path.join(TMP_DIR, 'import-sanitizer.js'));

test('strips script tags from summary and skills', () => {
  const out = sanitizeImportedResume({
    title: 'Resume',
    summary: 'Senior dev<script>alert(1)</script> with 10 years',
    skills: ['React<script>x</script>', 'TypeScript'],
  });
  assert.ok(!out.summary.includes('script'));
  assert.ok(!out.summary.includes('alert'));
  assert.ok(out.summary.includes('Senior dev'));
  assert.ok(out.skills.includes('React'));
  assert.ok(out.skills.includes('TypeScript'));
});

test('strips control characters from extracted text', () => {
  const out = sanitizeImportedResume({
    summary: 'Hello\u0000World\u0007Resume',
  });
  assert.equal(out.summary, 'HelloWorldResume');
});

test('removes javascript: links from contact', () => {
  const out = sanitizeImportedResume({
    contact: {
      fullName: 'Jane Doe',
      links: ['https://github.com/jane', 'javascript:alert(1)', 'https://linkedin.com/in/jane'],
    },
  });
  assert.ok(out.contact);
  assert.ok(!out.contact.links.some((l) => /javascript:/i.test(l)));
  assert.equal(out.contact.links.length, 2);
});

test('removes data:text/html links from contact', () => {
  const out = sanitizeImportedResume({
    contact: {
      fullName: 'Jane',
      links: ['data:text/html,<script>alert(1)</script>', 'https://jane.dev'],
    },
  });
  assert.ok(out.contact);
  assert.equal(out.contact.links.length, 1);
  assert.ok(out.contact.links[0].includes('jane.dev'));
});

test('strips HTML from experience role and company', () => {
  const out = sanitizeImportedResume({
    experience: [
      {
        company: '<b>Acme</b> Corp',
        role: '<i>Senior</i> Engineer',
        startDate: '2020',
        endDate: '2023',
        highlights: ['<script>x</script>Built things'],
      },
    ],
  });
  assert.equal(out.experience.length, 1);
  assert.ok(!out.experience[0].company.includes('<'));
  assert.ok(!out.experience[0].role.includes('<'));
  assert.ok(out.experience[0].company.toLowerCase().includes('acme'));
  assert.ok(out.experience[0].role.toLowerCase().includes('senior'));
  assert.ok(!out.experience[0].highlights[0].includes('script'));
});

test('preserves clean inputs unchanged', () => {
  const out = sanitizeImportedResume({
    title: 'Jane Doe Resume',
    summary: 'Senior Engineer with cloud expertise.',
    skills: ['TypeScript', 'AWS', 'Kubernetes'],
    contact: {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1 555 123 4567',
      links: ['https://github.com/jane'],
    },
  });
  assert.equal(out.title, 'Jane Doe Resume');
  assert.equal(out.summary, 'Senior Engineer with cloud expertise.');
  assert.deepEqual(out.skills, ['TypeScript', 'AWS', 'Kubernetes']);
  assert.equal(out.contact.fullName, 'Jane Doe');
  assert.equal(out.contact.email, 'jane@example.com');
});
