const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PublicAtsCheckController,
  PUBLIC_ATS_CHECK_RATE_LIMIT_MESSAGE,
  bandForScore,
  detectMissingSections,
  clientIpFromRequest,
} = require('../dist/public-api/public-ats-check.controller.js');
const { ResumeService } = require('../dist/resume/resume.service.js');

// scoreFreeText is stateless — a bare ResumeService with an empty
// prisma stub never touches persistence on this path.
function createController() {
  return new PublicAtsCheckController(new ResumeService({}));
}

function reqFor(ip) {
  return { headers: { 'x-forwarded-for': ip }, ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' } };
}

const SAMPLE_RESUME = [
  'Summary',
  'Platform engineer driving automation, reliability and cost reduction.',
  'Experience',
  'Acme Corp — Platform Engineer (2020–2024)',
  '- Led 3 engineers to automate deployments, cutting release time 40%.',
  '- Built CI/CD pipelines serving 200+ services.',
  'Education',
  'B.Tech Computer Science, State University',
  'Skills',
  'Node.js, TypeScript, NestJS, AWS, CI/CD, Docker',
].join('\n');

test('public ats-check returns the documented shape with sane values', async () => {
  const controller = createController();
  const result = await controller.atsCheck(reqFor('203.0.113.10'), { resumeText: SAMPLE_RESUME });

  assert.equal(typeof result.atsScore, 'number');
  assert.ok(result.atsScore >= 5 && result.atsScore <= 100, `score in range, got ${result.atsScore}`);
  assert.ok(['strong', 'promising', 'needs-work', 'at-risk'].includes(result.band));
  assert.ok(Array.isArray(result.topIssues));
  assert.ok(result.topIssues.length <= 5, 'topIssues capped at 5');
  assert.deepEqual(result.missingSections, [], 'complete resume has no missing sections');
  assert.match(result.disclaimer, /not stored/i, 'disclaimer states in-memory processing');
});

test('missing sections are reported and band tracks the score', async () => {
  const controller = createController();
  const result = await controller.atsCheck(reqFor('203.0.113.11'), {
    resumeText: 'Just a name and a phone number. Nothing else here.',
  });
  assert.deepEqual(result.missingSections, ['Summary', 'Experience', 'Education', 'Skills']);
  assert.equal(result.band, bandForScore(result.atsScore));
});

test('rejects missing and oversized resumeText (20k cap)', async () => {
  const controller = createController();
  await assert.rejects(() => controller.atsCheck(reqFor('203.0.113.12'), {}), /resumeText.*required/i);
  await assert.rejects(
    () => controller.atsCheck(reqFor('203.0.113.12'), { resumeText: 'x'.repeat(20_001) }),
    /too large/i,
  );
});

test('4th call from the same IP within the window is rate limited with signup message', async () => {
  const controller = createController();
  const ip = '203.0.113.99';
  for (let i = 0; i < 3; i += 1) {
    const result = await controller.atsCheck(reqFor(ip), { resumeText: SAMPLE_RESUME });
    assert.ok(result.atsScore >= 5, `call ${i + 1} succeeds`);
  }
  await assert.rejects(
    () => controller.atsCheck(reqFor(ip), { resumeText: SAMPLE_RESUME }),
    (err) => {
      assert.equal(err.getStatus(), 429);
      assert.equal(err.message, PUBLIC_ATS_CHECK_RATE_LIMIT_MESSAGE);
      assert.match(err.message, /3 per day/i, 'C-004: names the limit');
      assert.match(err.message, /free account/i, 'C-004: names the remediation');
      return true;
    },
  );
  // A different IP is unaffected.
  const other = await controller.atsCheck(reqFor('203.0.113.100'), { resumeText: SAMPLE_RESUME });
  assert.ok(other.atsScore >= 5);
});

test('rate-limit key uses the first x-forwarded-for value', () => {
  assert.equal(
    clientIpFromRequest({ headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.2' }, ip: '10.0.0.1' }),
    '198.51.100.7',
  );
  assert.equal(clientIpFromRequest({ headers: {}, ip: '10.0.0.1' }), '10.0.0.1');
});

test('detectMissingSections matches scoreFreeText heading heuristics', () => {
  assert.deepEqual(detectMissingSections('summary experience education skills'), []);
  assert.deepEqual(detectMissingSections('work history academics skills about me'), []);
});
