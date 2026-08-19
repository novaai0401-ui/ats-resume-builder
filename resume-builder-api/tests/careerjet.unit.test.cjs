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

test('normalizeCareerjetResults maps a REAL v4 payload into the shared JobOpening shape', () => {
  // Captured verbatim from a live v4 response, not invented. The first version
  // of this fixture guessed the shape and passed while the integration was
  // wrong — notably the date, which v4 sends as RFC 2822.
  const jobs = normalizeCareerjetResults({
    type: 'JOBS',
    hits: 73,
    pages: 25,
    message: '73 matching jobs found',
    response_time: 0.162,
    jobs: [
      {
        company: 'NR Consulting',
        date: 'Fri, 24 Jul 2026 07:07:25 GMT',
        description: 'Title: Lead – .NET <b>Frontend</b> <b>Engineer</b>  Location: Pune',
        locations: 'Mumbai, Maharashtra - Pune, Maharashtra',
        salary: '',
        site: '',
        title: 'Lead – .NET <b>Frontend</b> Engineer',
        url: 'https://jobviewtrack.com/v2/ShE_v4dpgTepy7FaweYzz5xGwhj075Qf',
      },
    ],
  });
  assert.equal(jobs.length, 1);
  // HTML is stripped — the title renders as text.
  assert.equal(jobs[0].title, 'Lead – .NET Frontend Engineer');
  assert.equal(jobs[0].company, 'NR Consulting');
  assert.equal(jobs[0].location, 'Mumbai, Maharashtra - Pune, Maharashtra');
  // An empty salary string becomes null, not "".
  assert.equal(jobs[0].salaryText, null);
  assert.equal(jobs[0].source, 'careerjet');
  // RFC 2822 in, ISO out. This is the assertion that would have caught every
  // opening arriving undated.
  assert.equal(jobs[0].postedAt, '2026-07-24T07:07:25.000Z');
});

test('normalizeCareerjetResults still parses the legacy date form', () => {
  const [job] = normalizeCareerjetResults({
    type: 'JOBS',
    jobs: [{ title: 'Engineer', url: 'https://x/1', date: '2026-08-18 09:30:00' }],
  });
  assert.ok(job.postedAt.startsWith('2026-08-18T'));
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

test('buildProfileJobQuery prefers a descriptive title over a terse role acronym', () => {
  // A real resume produced "AVP HTML5 CSS3 JavaScript" and matched nothing:
  // job boards index "Assistant Vice President", not the internal abbreviation.
  const q = buildProfileJobQuery({
    title: 'Assistant Vice President - Engineering / Frontend Platforms / Engineering Leadership',
    experience: [{ role: 'AVP' }],
    technicalSkills: ['HTML5', 'CSS3', 'JavaScript'],
    contact: { location: 'Pune, MH 411057' },
  });
  assert.ok(q.query.startsWith('Assistant Vice President'), q.query);
  assert.ok(!q.query.startsWith('AVP'), 'a terse acronym must not lead the query');
  // A headline is not a search term: only the first slash-segment, capped.
  assert.ok(!q.query.includes('Leadership'), q.query);
  assert.ok(!q.query.includes('-'), 'a dangling separator would be searched literally');
});

test('buildProfileJobQuery keeps a descriptive role ahead of the document title', () => {
  const q = buildProfileJobQuery({
    title: 'Tech Lead Resume v2',
    experience: [{ role: 'Senior Frontend Engineer' }],
    skills: ['React'],
  });
  assert.ok(q.query.startsWith('Senior Frontend Engineer'), q.query);
});

test('buildProfileJobQuery offers progressively broader fallbacks', () => {
  // Job APIs AND their keywords, so one precise query fails closed. Each rung
  // drops a constraint so a narrow phrasing degrades instead of returning [].
  const q = buildProfileJobQuery({
    experience: [{ role: 'Senior Frontend Engineer' }],
    technicalSkills: ['React', 'TypeScript', 'GraphQL'],
    contact: { location: 'Pune' },
  });
  assert.ok(q.fallbacks.length >= 2, JSON.stringify(q.fallbacks));
  // Broader means fewer terms, so the ladder must not grow.
  const lengths = [q.query, ...q.fallbacks].map((s) => s.split(' ').length);
  for (let i = 1; i < lengths.length; i++) {
    assert.ok(lengths[i] <= lengths[i - 1], `rung ${i} got longer: ${JSON.stringify(q.fallbacks)}`);
  }
  // The bare role must be reachable — it is the rung most likely to match.
  assert.ok([q.query, ...q.fallbacks].includes('Senior Frontend Engineer'));
});
