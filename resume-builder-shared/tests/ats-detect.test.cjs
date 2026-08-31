const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('hosted ATS platforms are identified from the hostname', async () => {
  const { detectAtsFromUrl } = await sharedPromise;
  const cases = [
    ['https://boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://acme.myworkdayjobs.com/en-US/careers/job/123', 'workday'],
    ['https://acme.wd5.myworkdaysite.com/recruiting/acme/careers', 'workday'],
    ['https://careers-acme.icims.com/jobs/123', 'icims'],
    ['https://jobs.lever.co/acme/uuid', 'lever'],
    ['https://acme.taleo.net/careersection/1/jobdetail.ftl', 'taleo'],
    ['https://jobs.smartrecruiters.com/Acme/123', 'smartrecruiters'],
    ['https://jobs.ashbyhq.com/acme/uuid', 'ashby'],
    ['https://acme.bamboohr.com/careers/123', 'bamboohr'],
    ['https://apply.workable.com/acme/j/ABC', 'workable'],
    ['https://acme.darwinbox.in/ms/candidate/careers', 'darwinbox'],
    ['https://acme.zohorecruit.com/jobs/Careers/1', 'zohorecruit'],
  ];
  for (const [url, ats] of cases) {
    const d = detectAtsFromUrl(url);
    assert.ok(d, `no detection for ${url}`);
    assert.equal(d.ats, ats, url);
    assert.equal(d.aggregator, false, url);
    assert.ok(d.label.length > 1);
  }
});

test('job boards are flagged as aggregators, not as the employer ATS', async () => {
  const { detectAtsFromUrl } = await sharedPromise;
  for (const url of [
    'https://www.linkedin.com/jobs/view/123',
    'https://www.naukri.com/job-listings-engineer',
    'https://in.indeed.com/viewjob?jk=abc',
    'https://www.foundit.in/job/engineer-123',
  ]) {
    const d = detectAtsFromUrl(url);
    assert.ok(d, url);
    assert.equal(d.aggregator, true, url);
  }
});

test('unknown, invalid, and empty URLs return null (no badge beats a wrong badge)', async () => {
  const { detectAtsFromUrl } = await sharedPromise;
  assert.equal(detectAtsFromUrl('https://careers.acme.com/jobs/1'), null);
  assert.equal(detectAtsFromUrl('not a url at all %%'), null);
  assert.equal(detectAtsFromUrl(''), null);
  assert.equal(detectAtsFromUrl(null), null);
  // A lookalike must not match: greenhouse.io.evil.com
  assert.equal(detectAtsFromUrl('https://greenhouse.io.evil.com/x'), null);
});

test('bare hostnames (no scheme) still detect', async () => {
  const { detectAtsFromUrl } = await sharedPromise;
  assert.equal(detectAtsFromUrl('boards.greenhouse.io/acme/jobs/1').ats, 'greenhouse');
});
