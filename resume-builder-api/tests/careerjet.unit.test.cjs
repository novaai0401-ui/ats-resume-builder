const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildCareerjetUrl,
  careerjetHeaders,
  isCareerjetAuthError,
  normalizeCareerjetResults,
} = require('../dist/live-jobs/careerjet.util.js');
const { buildProfileJobQuery } = require('../dist/live-jobs/profile-query.util.js');

const CFG = {
  apiKey: 'abcdef1234567890abcd',
  localeCode: 'en_IN',
  userIp: '127.0.0.1',
  userAgent: 'CallbackCV/1.0',
  referer: 'https://callbackcv.tekivex.com/jobs',
};

test('buildCareerjetUrl targets the v4 endpoint, not the dead legacy one', () => {
  // The legacy host answers 403 "Undeclared referrer" for new accounts, and
  // the key is no longer a query parameter — it moved into Basic auth.
  const url = buildCareerjetUrl(CFG, 'x');
  assert.ok(url.startsWith('https://search.api.careerjet.net/v4/query?'), url);
  assert.ok(!url.includes('affid='), 'the API key must not be sent in the query string');
  assert.ok(!url.includes(CFG.apiKey), 'the API key must never appear in the URL');
});

test('careerjetHeaders send the key as Basic auth with an empty password, plus a Referer', () => {
  const headers = careerjetHeaders(CFG);
  const [scheme, encoded] = headers.Authorization.split(' ');
  assert.equal(scheme, 'Basic');
  // Username = key, password EMPTY — hence the trailing colon.
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), `${CFG.apiKey}:`);
  // Required by v4; without it the API answers 403 "Undeclared referrer".
  assert.equal(headers.Referer, CFG.referer);
});

test('isCareerjetAuthError separates "refused the caller" from "found nothing"', () => {
  // These arrive as an error BODY, so without this they read as a quiet day.
  assert.match(
    isCareerjetAuthError({ type: 'ERROR', error: 'Unauthorized access from IP 1.2.3.4' }),
    /Unauthorized access from IP/,
  );
  assert.equal(isCareerjetAuthError({ type: 'JOBS', jobs: [] }), null);
  assert.equal(isCareerjetAuthError(null), null);
});

test('buildCareerjetUrl sends every search parameter Careerjet requires', () => {
  const url = buildCareerjetUrl(CFG, 'frontend engineer react', { where: 'Pune', limit: 5 });
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('keywords'), 'frontend engineer react');
  assert.equal(params.get('location'), 'Pune');
  assert.equal(params.get('locale_code'), 'en_IN');
  assert.equal(params.get('pagesize'), '5');
  // user_ip and user_agent are MANDATORY — omitting them returns an error
  // payload rather than results, which reads as "no jobs found".
  assert.equal(params.get('user_ip'), '127.0.0.1');
  assert.equal(params.get('user_agent'), 'CallbackCV/1.0');
});

test('buildCareerjetUrl clamps the page size', () => {
  const big = new URLSearchParams(buildCareerjetUrl(CFG, 'x', { limit: 999 }).split('?')[1]);
  assert.equal(big.get('pagesize'), '20');
  const small = new URLSearchParams(buildCareerjetUrl(CFG, 'x', { limit: 0 }).split('?')[1]);
  assert.equal(small.get('pagesize'), '1');
});

test('normalizeCareerjetResults maps a payload into the shared JobOpening shape', () => {
  const jobs = normalizeCareerjetResults({
    type: 'JOBS',
    jobs: [
      {
        title: 'Senior <b>Frontend</b> Engineer',
        company: 'Acme &amp; Co',
        locations: 'Pune, Maharashtra',
        url: 'https://www.careerjet.co.in/jobad/1',
        salary: '₹20L - ₹30L per year',
        date: '2026-08-18 09:30:00',
      },
    ],
  });
  assert.equal(jobs.length, 1);
  // HTML and entities are stripped — the title is rendered as text.
  assert.equal(jobs[0].title, 'Senior Frontend Engineer');
  assert.equal(jobs[0].company, 'Acme & Co');
  assert.equal(jobs[0].location, 'Pune, Maharashtra');
  assert.equal(jobs[0].salaryText, '₹20L - ₹30L per year');
  assert.equal(jobs[0].source, 'careerjet');
  // Careerjet dates are "YYYY-MM-DD HH:MM:SS", not ISO.
  assert.ok(jobs[0].postedAt.startsWith('2026-08-18T'));
});

test('normalizeCareerjetResults treats a non-JOBS payload as empty, not as data', () => {
  // Careerjet signals failure in the body with type !== 'JOBS' and still
  // returns HTTP 200, so this must not be mistaken for results.
  assert.deepEqual(normalizeCareerjetResults({ type: 'ERROR', error: 'bad key' }), []);
  assert.deepEqual(normalizeCareerjetResults({}), []);
  assert.deepEqual(normalizeCareerjetResults(null), []);
});

test('normalizeCareerjetResults drops rows with no title or url, and honours the limit', () => {
  const jobs = normalizeCareerjetResults({
    type: 'JOBS',
    jobs: [
      { title: '', url: 'https://x/1' },
      { title: 'Engineer', url: '' },
      { title: 'Engineer A', url: 'https://x/2' },
      { title: 'Engineer B', url: 'https://x/3' },
    ],
  }, 1);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Engineer A');
});

test('normalizeCareerjetResults returns null rather than an Invalid Date', () => {
  const [job] = normalizeCareerjetResults({
    type: 'JOBS',
    jobs: [{ title: 'Engineer', url: 'https://x/1', date: 'not a date' }],
  });
  assert.equal(job.postedAt, null);
});

test('buildProfileJobQuery leads with the latest role, not the document title', () => {
  // The document title is user-authored and often aspirational or
  // administrative; the experience entry is what they have actually done.
  const q = buildProfileJobQuery({
    title: 'Tech Lead Resume v2',
    experience: [{ role: 'Senior Frontend Engineer' }],
    technicalSkills: ['React', 'TypeScript', 'Node.js', 'GraphQL'],
    contact: { location: 'Pune, MH 411057' },
  });
  assert.ok(q.query.startsWith('Senior Frontend Engineer'));
  // Only a few skills — these APIs AND the terms, so a long query matches nothing.
  assert.equal(q.query.split(' ').filter((w) => w === 'React' || w === 'TypeScript').length, 2);
  assert.ok(!q.query.includes('GraphQL'));
  // A city, not the postcode.
  assert.equal(q.where, 'Pune');
  assert.equal(q.empty, false);
});

test('buildProfileJobQuery strips resume bookkeeping from the title fallback', () => {
  const q = buildProfileJobQuery({ title: 'Product Manager Resume final', experience: [] });
  assert.equal(q.query, 'Product Manager');
});

test('buildProfileJobQuery does not repeat a skill already named in the role', () => {
  const q = buildProfileJobQuery({
    experience: [{ role: 'React Developer' }],
    skills: ['React', 'Redux'],
  });
  assert.equal(q.query, 'React Developer Redux');
});

test('buildProfileJobQuery reports empty rather than searching for nothing', () => {
  const q = buildProfileJobQuery({ contact: { location: 'Pune' } });
  assert.equal(q.empty, true);
  assert.equal(q.query, '');
});
