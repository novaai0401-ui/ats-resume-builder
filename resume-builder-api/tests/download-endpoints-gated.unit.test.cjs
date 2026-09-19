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

/**
 * Extract the body of an async handler method by name.
 *
 * This used to slice a fixed 900 characters and hope the guard fell
 * inside. Adding one parameter and a comment to the pdf handler pushed
 * the guard past the window and failed the test while the guard was
 * still there — a false alarm on a payment check is worse than no check
 * on the test, because it trains people to ignore it. Brace-match the
 * real body instead.
 */
function handlerBody(name) {
  const start = src.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `handler ${name} should exist`);
  // The parameter list contains braces of its own — `@Req() req: { user:
  // { userId: string } }` — so find the matching close paren of the
  // parameter list first, then the body brace after it.
  const parenStart = src.indexOf('(', start);
  let parenDepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < src.length; i += 1) {
    if (src[i] === '(') parenDepth += 1;
    else if (src[i] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenEnd = i; break; }
    }
  }
  assert.notEqual(parenEnd, -1, `handler ${name} should have a parameter list`);
  const open = src.indexOf('{', parenEnd);
  assert.notEqual(open, -1, `handler ${name} should have a body`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading handler ${name}`);
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
