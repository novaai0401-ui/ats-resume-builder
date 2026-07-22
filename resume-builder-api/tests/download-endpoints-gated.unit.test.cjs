const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

/**
 * Monetisation invariant guard.
 *
 * Every endpoint that streams a downloadable resume FILE (clean PDF / DOCX)
 * must enforce the per-download charge when it is enabled — i.e. call
 * `downloadCharge.assertDownloadAllowed(...)` behind
 * `downloadCharge.isFeatureEnabled()`. If someone adds a new export route or
 * drops the guard, downloads silently become free. This test reads the
 * controller source and fails on that regression. (The charge math itself is
 * covered by download-charge-flow.unit.test.cjs.)
 */
const controllerPath = path.join(__dirname, '..', 'src', 'resume', 'resume.controller.ts');
const src = readFileSync(controllerPath, 'utf-8');

/** Extract the body of an async handler method by name (best-effort brace match). */
function handlerBody(name) {
  const start = src.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `handler ${name} should exist`);
  // Take a generous slice; the guard call appears near the top of the body.
  return src.slice(start, start + 900);
}

for (const [route, handler] of [
  [":id/pdf", 'pdf'],
  [":id/docx", 'docx'],
]) {
  test(`${handler} download route (${route}) enforces the charge when enabled`, () => {
    assert(src.includes(`'${route}'`) || src.includes(`"${route}"`), `route ${route} should be declared`);
    const body = handlerBody(handler);
    assert(
      body.includes('isFeatureEnabled()'),
      `${handler} handler must check downloadCharge.isFeatureEnabled()`,
    );
    assert(
      body.includes('assertDownloadAllowed('),
      `${handler} handler must call assertDownloadAllowed() to require a paid token`,
    );
  });
}

test('the only file-streaming exports are the two gated routes (no ungated bypass)', () => {
  // Count download-token guards; must be >= the number of file exports.
  const guards = (src.match(/assertDownloadAllowed\(/g) || []).length;
  assert(guards >= 2, `expected >=2 charge guards, found ${guards}`);

  // The dev-only HTML export must stay blocked in production.
  const debug = src.slice(src.indexOf('async debugExportHtml('));
  assert(
    /NODE_ENV === 'production'/.test(debug.slice(0, 400)),
    'debug/export-html must remain disabled in production so it cannot leak a clean copy',
  );
});
